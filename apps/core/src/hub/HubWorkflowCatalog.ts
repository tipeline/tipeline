import { Parser } from '@utils/Parser';
import { HubService } from '@database/services/HubService';
import { TaskService } from '@database/services/TaskService';
import { PluginService } from '@database/services/PluginService';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { ActionRegistry } from '@action/ActionRegistry';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { descriptionSummary } from '@tipeline/utils';
import {
  actionGroups,
  hubWorkflowId,
  workflowInputs,
  workflowOutputs,
  type WorkflowInput,
  type WorkflowOutput,
  type WorkflowSummary,
} from '@engine/WorkflowCatalog';
import { capabilityReport, type CapabilityReport } from '@engine/WorkflowCapabilities';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem } from '@/hub/HubProvider';

/** A plugin a hub workflow needs that this Core can't run yet. */
export interface MissingPlugin {
  group: string;
  /**
   * notInstalled; disabled (turned off); missing (its folder is gone); notLoaded
   * (installed and on, but Core hasn't loaded it — a restart picks it up).
   */
  state: 'notInstalled' | 'disabled' | 'missing' | 'notLoaded';
  pluginName?: string;
  /** The installed plugin's identifier (any state but notInstalled), e.g. to turn it on. */
  pluginIdentifier?: string;
  /** A hub plugin that provides the group, when one of the enabled hubs lists it. */
  hubPlugin?: { hubId: string; hubName: string; identifier: string; name: string };
}

/** What installing a hub workflow would bring, read from its file before anything is installed. */
export interface HubTaskPreview {
  hubId: string;
  hubName: string;
  itemIdentifier: string;
  name: string;
  description?: string;
  version: string;
  inputs: WorkflowInput[];
  outputs?: WorkflowOutput[];
  /** Run by other workflows for its data; the assistant never proposes it as a run. */
  helper?: true;
  missingPlugins: MissingPlugin[];
  /** What the workflow can do once installed, for the confirm-before-install dialog. */
  capabilities: CapabilityReport;
}

// Catalogs change rarely; the agent searches on every request.
const CATALOG_TTL_MS = 5 * 60_000;
// Previews read the workflow's file, which for a remote hub is a download.
const PREVIEWS_PER_SEARCH = 3;

/**
 * Workflows on the enabled hubs that aren't installed yet, for the agent's search,
 * and the install preview its proposal card shows. Hub catalogs are cached for a
 * few minutes and previews by item version; a hub that can't be reached is skipped.
 */
export class HubWorkflowCatalog {
  private static catalogs = new Map<string, { at: number; items: HubCatalogItem[] }>();
  private static previews = new Map<
    string,
    Omit<HubTaskPreview, 'missingPlugins' | 'capabilities'> & { groups: string[]; actions: any[] }
  >();

  private static async catalog(hub: Hub): Promise<HubCatalogItem[]> {
    const cached = this.catalogs.get(hub.id);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.items;
    const items = await HubProviderFactory.getProvider(hub).fetchCatalog(hub);
    this.catalogs.set(hub.id, { at: Date.now(), items });
    return items;
  }

  /** Hub workflows not installed from that hub yet. Their inputs are filled in by `withInputs`. */
  static async uninstalledWorkflows(): Promise<{ workflows: WorkflowSummary[]; unreachableHubs: string[] }> {
    const hubs = await HubService.listEnabled();
    if (hubs.length === 0) return { workflows: [], unreachableHubs: [] };

    const installed = new Set(
      ((await TaskService.getAll()) as any[])
        .filter((task) => task.hub_id && task.hub_task_identifier)
        .map((task) => `${task.hub_id}:${task.hub_task_identifier}`)
    );

    const workflows: WorkflowSummary[] = [];
    const unreachableHubs: string[] = [];
    const results = await Promise.allSettled(hubs.map((hub) => this.catalog(hub)));
    results.forEach((result, index) => {
      const hub = hubs[index];
      if (result.status === 'rejected') {
        unreachableHubs.push(hub.name);
        return;
      }
      for (const item of result.value) {
        if (item.type !== 'task' || installed.has(`${hub.id}:${item.identifier}`)) continue;
        const description = descriptionSummary(item.description ?? '');
        workflows.push({
          identifier: hubWorkflowId(hub.id, item.identifier),
          name: item.name,
          ...(description ? { description } : {}),
          inputs: [],
          hub: { id: hub.id, name: hub.name, itemIdentifier: item.identifier, version: item.version },
        });
      }
    });
    return { workflows, unreachableHubs };
  }

  /**
   * Fills in the inputs of the first few hub workflows in a search result, so the
   * model can read values for them as it does for installed ones. A workflow
   * whose file can't be read keeps an empty list.
   */
  static async withInputs(workflows: WorkflowSummary[]): Promise<WorkflowSummary[]> {
    let budget = PREVIEWS_PER_SEARCH;
    return await Promise.all(
      workflows.map(async (workflow) => {
        if (!workflow.hub || budget <= 0) return workflow;
        budget--;
        try {
          const preview = await this.readItem(workflow.hub.id, workflow.hub.itemIdentifier);
          return {
            ...workflow,
            inputs: preview.inputs,
            ...(preview.outputs?.length ? { outputs: preview.outputs } : {}),
            ...(preview.helper ? { helper: preview.helper } : {}),
          };
        } catch {
          return workflow;
        }
      })
    );
  }

  private static async readItem(hubId: string, itemIdentifier: string) {
    const hub = await HubService.getById(hubId);
    if (!hub) throw new Error(`Hub "${hubId}" not found`);
    const item = (await this.catalog(hub)).find((i) => i.type === 'task' && i.identifier === itemIdentifier);
    if (!item) throw new Error(`Workflow "${itemIdentifier}" not found on hub "${hub.name}"`);

    const key = `${hub.id}:${item.identifier}:${item.version}`;
    const cached = this.previews.get(key);
    if (cached) return cached;

    const filePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
    const source = Parser.importFromFile(filePath) as any;
    const description = descriptionSummary(source?.description ?? item.description ?? '');
    const preview = {
      hubId: hub.id,
      hubName: hub.name,
      itemIdentifier: item.identifier,
      name: source?.name ?? item.name,
      ...(description ? { description } : {}),
      version: item.version,
      inputs: workflowInputs(source),
      outputs: workflowOutputs(source),
      ...(source?.helper === true ? { helper: true as const } : {}),
      groups: actionGroups(source?.pipeline?.actions ?? []),
      actions: source?.pipeline?.actions ?? [],
    };
    this.previews.set(key, preview);
    return preview;
  }

  /** The workflow's inputs, what it can do, and which of its plugins this Core is missing and where to get them. */
  static async preview(hubId: string, itemIdentifier: string): Promise<HubTaskPreview> {
    const { groups, actions, ...preview } = await this.readItem(hubId, itemIdentifier);
    const missingGroups = groups.filter((group) => !ActionRegistry[group] && !PluginActionRegistry[group]);
    const missingPlugins = await Promise.all(missingGroups.map((group) => this.describeMissing(group)));
    // Worked out on each preview, not cached: its sub-workflows may be installed since.
    const capabilities = await capabilityReport({ pipeline: { actions } });
    return { ...preview, missingPlugins, capabilities };
  }

  private static async describeMissing(group: string): Promise<MissingPlugin> {
    const record = await PluginService.getByGroup(group);
    const state: MissingPlugin['state'] = !record
      ? 'notInstalled'
      : record.status === 'missing'
        ? 'missing'
        : !record.enabled
          ? 'disabled'
          : 'notLoaded';
    const hubPlugin = state === 'notInstalled' ? await this.findHubPlugin(group) : undefined;
    return {
      group,
      state,
      ...(record?.name ? { pluginName: record.name } : {}),
      ...(record?.identifier ? { pluginIdentifier: record.identifier } : {}),
      ...(hubPlugin ? { hubPlugin } : {}),
    };
  }

  private static async findHubPlugin(group: string): Promise<MissingPlugin['hubPlugin']> {
    for (const hub of await HubService.listEnabled()) {
      try {
        const item = (await this.catalog(hub)).find((i) => i.type === 'plugin' && i.group === group);
        if (item) return { hubId: hub.id, hubName: hub.name, identifier: item.identifier, name: item.name };
      } catch {
        // An unreachable hub can't offer the plugin; try the next one.
      }
    }
    return undefined;
  }

  /** Drops cached catalogs, e.g. after a hub's settings change. */
  static clear() {
    this.catalogs.clear();
    this.previews.clear();
  }
}

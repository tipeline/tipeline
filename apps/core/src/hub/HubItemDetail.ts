import decompress from 'decompress';
import { Parser } from '@utils/Parser';
import { HubService } from '@database/services/HubService';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { removeHubDownload } from '@/hub/RemoteHubProvider';
import {
  HubWorkflowCatalog,
  type HubTaskPreview,
  type MissingPlugin,
} from '@/hub/HubWorkflowCatalog';
import { combinedCapabilityReport, type CapabilityReport } from '@engine/WorkflowCapabilities';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem, HubCatalogItemType } from '@/hub/HubProvider';

/**
 * What a hub item holds, read from its file before anything is installed, for the
 * Hub's detail drawer. Nothing here runs the item: a workflow and an app are read as
 * documents, and a plugin's package is listed without being unpacked or loaded.
 */

export interface HubWorkflowDetail extends HubTaskPreview {
  type: 'task';
  /** Every step, including steps nested in loops and conditions. */
  steps: number;
}

export interface HubAppWorkflow {
  /** The name the app's components use for it. */
  alias: string;
  name: string;
  /** The workflow's identifier on the hub; left out for one the app expects to be installed already. */
  hubIdentifier?: string;
  /** Set when the app names a hub workflow this hub doesn't list. */
  notOnHub?: true;
}

export interface HubAppDetail {
  type: 'app';
  pages: { id: string; name: string }[];
  workflows: HubAppWorkflow[];
  /** What the app's hub workflows can do together. */
  capabilities: CapabilityReport;
  missingPlugins: MissingPlugin[];
}

export interface HubPluginDetail {
  type: 'plugin';
  group?: string;
  license?: string;
  homepage?: string;
  /** npm packages installed with the plugin. */
  dependencies: { name: string; version: string }[];
  files: { path: string; size: number }[];
}

export type HubItemDetail = HubWorkflowDetail | HubAppDetail | HubPluginDetail;

const countSteps = (actions: any[]): number => {
  if (!Array.isArray(actions)) return 0;
  let count = 0;
  for (const action of actions) {
    count++;
    if (Array.isArray(action?.params?.actions)) count += countSteps(action.params.actions);
    if (Array.isArray(action?.params?.statements)) {
      for (const stmt of action.params.statements) count += countSteps(stmt?.actions);
    }
  }
  return count;
};

async function findItem(
  hub: Hub,
  type: HubCatalogItemType,
  itemIdentifier: string
): Promise<HubCatalogItem> {
  const catalog = await HubProviderFactory.getProvider(hub).fetchCatalog(hub);
  const item = catalog.find((i) => i.type === type && i.identifier === itemIdentifier);
  if (!item) throw new Error(`${type} "${itemIdentifier}" not found on hub "${hub.name}"`);
  return item;
}

async function workflowDetail(hubId: string, itemIdentifier: string): Promise<HubWorkflowDetail> {
  const [preview, file] = await Promise.all([
    HubWorkflowCatalog.preview(hubId, itemIdentifier),
    HubWorkflowCatalog.workflowFile(hubId, itemIdentifier),
  ]);
  return { type: 'task', ...preview, steps: countSteps(file.actions) };
}

async function appDetail(hub: Hub, itemIdentifier: string): Promise<HubAppDetail> {
  const item = await findItem(hub, 'app', itemIdentifier);
  const filePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
  let app: any;
  try {
    app = Parser.importFromFile(filePath);
  } finally {
    removeHubDownload(hub, filePath);
  }

  const pages = (Array.isArray(app?.pages) ? app.pages : [])
    .filter((page: any) => page?.id)
    .map((page: any) => ({ id: String(page.id), name: String(page.name ?? page.id) }));

  const declared: Record<string, any> =
    app?.workflows && typeof app.workflows === 'object' ? app.workflows : {};
  const workflows: HubAppWorkflow[] = [];
  const read: { identifier: string; name: string; source: unknown }[] = [];
  const groups: string[] = [];
  for (const [alias, ref] of Object.entries(declared)) {
    if (ref && typeof ref === 'object' && typeof ref.hub === 'string') {
      try {
        const file = await HubWorkflowCatalog.workflowFile(hub.id, ref.hub);
        workflows.push({ alias, name: file.name, hubIdentifier: ref.hub });
        read.push({
          identifier: ref.hub,
          name: file.name,
          source: { pipeline: { actions: file.actions } },
        });
        groups.push(...file.groups);
      } catch {
        workflows.push({ alias, name: ref.hub, hubIdentifier: ref.hub, notOnHub: true });
      }
    } else {
      workflows.push({ alias, name: String(ref?.identifier ?? ref ?? alias) });
    }
  }

  const [capabilities, missingPlugins] = await Promise.all([
    combinedCapabilityReport(read),
    HubWorkflowCatalog.missingPlugins(groups),
  ]);
  return { type: 'app', pages, workflows, capabilities, missingPlugins };
}

async function pluginDetail(hub: Hub, itemIdentifier: string): Promise<HubPluginDetail> {
  const item = await findItem(hub, 'plugin', itemIdentifier);
  const archivePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
  let entries: { path: string; type: string; data: Buffer }[];
  try {
    // Read into memory: nothing is written to disk and none of the plugin's code runs.
    entries = (await decompress(archivePath)) as any;
  } finally {
    removeHubDownload(hub, archivePath);
  }

  const files = entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({ path: entry.path, size: entry.data.length }))
    .sort((a, b) => a.path.localeCompare(b.path));

  let pkg: any = {};
  const packageEntry = entries.find(
    (entry) => entry.type === 'file' && entry.path === 'package.json'
  );
  if (packageEntry) {
    try {
      pkg = JSON.parse(packageEntry.data.toString('utf-8'));
    } catch {
      pkg = {};
    }
  }
  const dependencies =
    pkg.dependencies && typeof pkg.dependencies === 'object'
      ? Object.entries(pkg.dependencies).map(([name, version]) => ({
          name,
          version: String(version),
        }))
      : [];
  const homepage =
    typeof pkg.homepage === 'string' && /^https?:\/\//i.test(pkg.homepage)
      ? pkg.homepage
      : undefined;

  return {
    type: 'plugin',
    ...(item.group ? { group: item.group } : {}),
    ...(typeof pkg.license === 'string' ? { license: pkg.license } : {}),
    ...(homepage ? { homepage } : {}),
    dependencies,
    files,
  };
}

export async function hubItemDetail(
  hubId: string,
  type: HubCatalogItemType,
  itemIdentifier: string
): Promise<HubItemDetail> {
  const hub = await HubService.getById(hubId);
  if (!hub) throw new Error(`Hub "${hubId}" not found`);
  if (type === 'task') return await workflowDetail(hub.id, itemIdentifier);
  if (type === 'app') return await appDetail(hub, itemIdentifier);
  if (type === 'plugin') return await pluginDetail(hub, itemIdentifier);
  throw new Error(`Unknown hub item type "${type}"`);
}

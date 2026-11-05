import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import decompress from 'decompress';
import semver from 'semver';
import { Parser } from '@utils/Parser';
import { addActionsIdentifiers } from '@utils/ActionIdentifiers';
import { TaskValidator } from '@validation/TaskValidation';
import { HubService } from '@database/services/HubService';
import { TaskService } from '@database/services/TaskService';
import { AppService } from '@database/services/AppService';
import { PluginService } from '@database/services/PluginService';
import { PluginLoader, PLUGINS_DIR, PLUGIN_STAGING_DIR } from '@/plugin/PluginLoader';
import { HubProviderFactory } from '@/hub/HubProviderFactory';
import { AssetService, type AssetKind } from '@/asset/AssetService';
import type { Hub } from '@database/models/Hub';
import type { HubCatalogItem, HubCatalogItemType, HubProvider } from '@/hub/HubProvider';
import { splitAppDocument } from '@utils/appDocument';
import { HubUpdateEventService, type HubAttention, type HubEventItem } from '@database/services/HubUpdateEventService';
import { checkHubFileVersion, hubUpdateState, HubUpdateHeldError, type HubUpdateState } from '@/hub/HubUpdatePolicy';
import { appUpdateChanges, workflowUpdateChanges } from '@/hub/HubUpdatePreview';

async function getHubAndItem(hubId: string, itemIdentifier: string, type: HubCatalogItemType) {
  const hub = await HubService.getById(hubId);
  if (!hub) throw new Error(`Hub "${hubId}" not found`);

  const provider = HubProviderFactory.getProvider(hub);
  const catalog = await provider.fetchCatalog(hub);
  const item = catalog.find((i) => i.type === type && i.identifier === itemIdentifier);
  if (!item) throw new Error(`${type} "${itemIdentifier}" not found on hub "${hub.name}"`);

  return { hub, provider, item };
}

const NPM_INSTALL_TIMEOUT_MS = 90_000;

function packageJsonVersion(dir: string): string | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
}

function eventItem(type: HubCatalogItemType, record: any): HubEventItem {
  return {
    type,
    identifier: record.identifier,
    name: record.name,
    hubName: record.hub_name,
    fromVersion: record.version,
  };
}

function attentionFor(state: HubUpdateState, version: string): HubAttention | null {
  if (state === 'major') return { kind: 'major_waiting', toVersion: version };
  if (state === 'older') return { kind: 'older_listed', toVersion: version };
  if (state === 'available') return { kind: 'update_available', toVersion: version };
  return null;
}

async function runNpmInstall(cwd: string): Promise<void> {
  console.log(`[HubSyncService] Running npm install in ${cwd}...`);
  await new Promise<void>((resolve, reject) => {
    // --no-audit/--no-fund/--prefer-offline: this install only needs the
    // packages themselves — the extra registry round-trips those flags skip
    // are what turn an otherwise-instant zero-dependency install into
    // something slow enough to trip a client-side timeout.
    const child = spawn(
      'npm',
      ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefer-offline'],
      { cwd, stdio: 'ignore' }
    );

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`npm install timed out after ${NPM_INSTALL_TIMEOUT_MS / 1000}s in ${cwd}`));
    }, NPM_INSTALL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`[HubSyncService] npm install finished in ${cwd}`);
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code} in ${cwd}`));
      }
    });
  });
}

interface HubUpdateOptions {
  /** Started by the hourly check rather than by the user: a major version has to wait. */
  automatic?: boolean;
}

export type HubCheckResult = { id: string; name: string; ok: boolean; items?: number; error?: string };

export class HubSyncService {
  /**
   * Copies a catalog item's image into the installed entity's own asset
   * storage, so the thumbnail persists locally after install instead of
   * depending on the hub still being reachable. A local-folder hub's image
   * arrives already inlined as base64 (see LocalFolderHubProvider.fetchCatalog);
   * a remote hub's image is a URL that still needs downloading.
   */
  private static async copyItemImage(
    kind: AssetKind,
    identifier: string,
    hub: Hub,
    provider: HubProvider,
    item: HubCatalogItem
  ): Promise<string | undefined> {
    if (!item.image) return undefined;
    try {
      if (item.image.startsWith('data:')) {
        return AssetService.saveImage(kind, identifier, item.image);
      }
      const filePath = await provider.fetchImageFile(hub, item);
      return filePath ? AssetService.saveImageFromFile(kind, identifier, filePath) : undefined;
    } catch (err: any) {
      console.error(`[HubSyncService] Failed to copy image for "${item.identifier}":`, err.message ?? err);
      return undefined;
    }
  }

  // ---------------------------------------------------------------------
  // Task
  // ---------------------------------------------------------------------

  private static async fetchAndValidateTask(hub: Hub, item: HubCatalogItem) {
    const filePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
    const rawTask = Parser.importFromFile(filePath);
    const validatedTask = TaskValidator.validateFormat(rawTask) as any;

    // Every action needs a unique identifier within its block before it's ever
    // persisted — pipeline_action rows are keyed on (block_id, identifier), and
    // hub-sourced actions don't carry one. Same step Core.taskInstall performs
    // for local file installs.
    if (validatedTask.pipeline?.actions) {
      validatedTask.pipeline.actions = addActionsIdentifiers(validatedTask.pipeline.actions);
    }

    const actionTypeErrors = await TaskValidator.validateActionTypes(validatedTask.pipeline?.actions ?? [], undefined, {
      params: true,
    });
    if (actionTypeErrors.length > 0) {
      throw new Error(`Cannot install task "${item.identifier}" from hub "${hub.name}": ${actionTypeErrors.join('; ')}`);
    }

    return validatedTask;
  }

  static async installTask(hubId: string, itemIdentifier: string) {
    const { hub, provider, item } = await getHubAndItem(hubId, itemIdentifier, 'task');
    const existing = await TaskService.getByHubRef(hub.id, item.identifier);
    if (existing) throw new Error(`Workflow "${item.identifier}" is already installed from hub "${hub.name}"`);

    const validatedTask = await this.fetchAndValidateTask(hub, item);

    const installed = await TaskService.installFromHub({
      name: validatedTask.name,
      description: validatedTask.description,
      author: validatedTask.author,
      version: validatedTask.version ?? item.version,
      platform: validatedTask.platform,
      tags: validatedTask.tags,
      source: JSON.stringify(validatedTask),
      hub_id: hub.id,
      hub_task_identifier: item.identifier,
      hub_version: item.version,
    });

    const image = await this.copyItemImage('tasks', installed.identifier, hub, provider, item);
    return image ? await TaskService.updateImage(installed.identifier, image) : installed;
  }

  static async updateTask(taskIdentifier: string, { automatic = false }: HubUpdateOptions = {}) {
    const record = await TaskService.getByIdentifier(taskIdentifier);
    if (!record || record.source_type !== 'hub' || !record.hub_id || !record.hub_task_identifier) {
      throw new Error(`Workflow "${taskIdentifier}" is not installed from a hub`);
    }

    try {
      const { hub, item } = await getHubAndItem(record.hub_id, record.hub_task_identifier, 'task');
      if (hubUpdateState(record.version, item.version) === 'current') return record;
      const validatedTask = await this.fetchAndValidateTask(hub, item);
      checkHubFileVersion(record.name, record.version, validatedTask.version, automatic);
      const updated = await TaskService.markSynced(taskIdentifier, item.version, JSON.stringify(validatedTask));
      await HubUpdateEventService.recordUpdated(eventItem('task', record), updated?.version, !automatic);
      return updated;
    } catch (err) {
      // Applies whether this came from the manual "Update now" button or the
      // background poll — either way, a failed fetch/apply means the hub side
      // of this task is unhealthy right now, not just "no update available."
      await this.noteUpdateProblem(eventItem('task', record), TaskService, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // App
  // ---------------------------------------------------------------------

  /**
   * Replaces an app's `workflows: { alias: { hub: <item> } }` entries with installed
   * workflows from the same hub: one already installed from it is reused, any other
   * is installed now. The app (with placeholder identifiers) and the catalog entries
   * are checked first, so a broken app or a missing workflow installs nothing.
   */
  private static async resolveHubWorkflows(hub: Hub, rawApp: any): Promise<any> {
    const declared: Record<string, any> = rawApp?.workflows && typeof rawApp.workflows === 'object' ? rawApp.workflows : {};
    const refs = Object.entries(declared).filter(([, ref]) => ref && typeof ref === 'object' && typeof ref.hub === 'string');
    if (!refs.length) return rawApp;

    const withIdentifiers = (resolved: Record<string, string>) => ({
      ...rawApp,
      workflows: Object.fromEntries(
        Object.entries(declared).map(([alias, ref]) => (alias in resolved ? [alias, { identifier: resolved[alias] }] : [alias, ref]))
      ),
    });
    splitAppDocument(withIdentifiers(Object.fromEntries(refs.map(([alias]) => [alias, 'pending']))));

    const catalog = await HubProviderFactory.getProvider(hub).fetchCatalog(hub);
    for (const [alias, ref] of refs) {
      if (!catalog.some((i) => i.type === 'task' && i.identifier === ref.hub)) {
        throw new Error(`Workflow "${ref.hub}" (used by "${alias}") is not on hub "${hub.name}"`);
      }
    }

    const resolved: Record<string, string> = {};
    for (const [alias, ref] of refs) {
      const existing = await TaskService.getByHubRef(hub.id, ref.hub);
      resolved[alias] = existing ? existing.identifier : (await this.installTask(hub.id, ref.hub)).identifier;
    }
    return withIdentifiers(resolved);
  }

  private static async fetchApp(hub: Hub, item: HubCatalogItem) {
    const filePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
    const rawApp = Parser.importFromFile(filePath) as any;
    if (!rawApp?.name) throw new Error(`App "${item.identifier}" from hub "${hub.name}" must include a name field`);
    return rawApp;
  }

  static async installApp(hubId: string, itemIdentifier: string) {
    const { hub, provider, item } = await getHubAndItem(hubId, itemIdentifier, 'app');
    const existing = await AppService.getByHubRef(hub.id, item.identifier);
    if (existing) throw new Error(`App "${item.identifier}" is already installed from hub "${hub.name}"`);

    const rawApp = await this.resolveHubWorkflows(hub, await this.fetchApp(hub, item));
    const { name, version, description, author, source } = splitAppDocument(rawApp, item.version);

    const installed = await AppService.installFromHub({
      name,
      description,
      author,
      version,
      source,
      hub_id: hub.id,
      hub_app_identifier: item.identifier,
      hub_version: item.version,
    });

    const image = await this.copyItemImage('apps', installed.identifier, hub, provider, item);
    return image ? await AppService.updateImage(installed.identifier, image) : installed;
  }

  static async updateApp(appIdentifier: string, { automatic = false }: HubUpdateOptions = {}) {
    const record = await AppService.getByIdentifier(appIdentifier);
    if (!record || record.source_type !== 'hub' || !record.hub_id || !record.hub_app_identifier) {
      throw new Error(`App "${appIdentifier}" is not installed from a hub`);
    }

    try {
      const { hub, item } = await getHubAndItem(record.hub_id, record.hub_app_identifier, 'app');
      if (hubUpdateState(record.version, item.version) === 'current') return record;
      const fetched = await this.fetchApp(hub, item);
      // Before the app's hub workflows are resolved: that installs any new ones.
      checkHubFileVersion(record.name, record.version, fetched.version, automatic);
      const rawApp = await this.resolveHubWorkflows(hub, fetched);
      const { name, version, description, author, source } = splitAppDocument(rawApp, item.version);

      const updated = await AppService.markSynced(appIdentifier, { name, description, author, version, source, hubVersion: item.version });
      await HubUpdateEventService.recordUpdated(eventItem('app', record), updated?.version, !automatic);
      return updated;
    } catch (err) {
      await this.noteUpdateProblem(eventItem('app', record), AppService, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Plugin
  // ---------------------------------------------------------------------

  /**
   * Builds the new package in a staging folder and only swaps it in once it loads, so a
   * bad download, a failed npm install or a broken package leaves the installed plugin
   * as it was. `checkVersion` runs on the staged package and can refuse it by throwing.
   */
  private static async applyPluginPackage(
    hub: Hub,
    item: HubCatalogItem,
    checkVersion?: (version: string | undefined) => void
  ): Promise<string> {
    console.log(`[HubSyncService] Installing plugin "${item.identifier}" from hub "${hub.name}"...`);
    const archivePath = await HubProviderFactory.getProvider(hub).fetchFile(hub, item);
    const destDir = path.join(PLUGINS_DIR, item.identifier);
    const stagedDir = path.join(PLUGINS_DIR, PLUGIN_STAGING_DIR, `${item.identifier}-${Date.now()}`);
    const previousDir = `${stagedDir}-previous`;

    fs.mkdirSync(stagedDir, { recursive: true });

    let swapped = false;
    try {
      console.log(`[HubSyncService] Extracting ${archivePath} to ${stagedDir}...`);
      await decompress(archivePath, stagedDir);
      // Refuse from package.json when it can: nothing from the package has run yet.
      checkVersion?.(packageJsonVersion(stagedDir));
      await runNpmInstall(stagedDir);

      const staged = await PluginLoader.inspect(stagedDir);
      if (!staged) {
        throw new Error(`Plugin at "${item.identifier}" did not export a valid { group, actions }`);
      }
      checkVersion?.(staged.version);

      if (fs.existsSync(destDir)) fs.renameSync(destDir, previousDir);
      fs.renameSync(stagedDir, destDir);
      swapped = true;

      const group = await PluginLoader.reloadSingle(destDir);
      if (!group) {
        throw new Error(`Plugin at "${item.identifier}" did not export a valid { group, actions }`);
      }
      fs.rmSync(previousDir, { recursive: true, force: true });
      return group;
    } catch (err) {
      if (swapped) fs.rmSync(destDir, { recursive: true, force: true });
      if (fs.existsSync(previousDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
        fs.renameSync(previousDir, destDir);
        await PluginLoader.reloadSingle(destDir);
      }
      fs.rmSync(stagedDir, { recursive: true, force: true });
      throw err;
    }
  }

  static async installPlugin(hubId: string, itemIdentifier: string) {
    const { hub, provider, item } = await getHubAndItem(hubId, itemIdentifier, 'plugin');
    const existing = await PluginService.getByHubRef(hub.id, item.identifier);
    if (existing) throw new Error(`Plugin "${item.identifier}" is already installed from hub "${hub.name}"`);

    const group = await this.applyPluginPackage(hub, item);
    const installed = await PluginService.markHubInstalled(group, {
      hub_id: hub.id,
      hub_plugin_identifier: item.identifier,
      hub_version: item.version,
    });

    // Only backfill from the catalog if the plugin's own code (loaded by
    // applyPluginPackage, above) didn't already declare its own image.
    if (installed && !installed.image) {
      const image = await this.copyItemImage('plugins', installed.identifier, hub, provider, item);
      if (image) await PluginService.setImageIfMissing(installed.identifier, image);
    }

    return installed;
  }

  static async updatePlugin(pluginIdentifier: string, { automatic = false }: HubUpdateOptions = {}) {
    const record = await PluginService.getByIdentifier(pluginIdentifier);
    if (!record || record.source_type !== 'hub' || !record.hub_id || !record.hub_plugin_identifier) {
      throw new Error(`Plugin "${pluginIdentifier}" is not installed from a hub`);
    }

    try {
      const { hub, item } = await getHubAndItem(record.hub_id, record.hub_plugin_identifier, 'plugin');
      if (hubUpdateState(record.version, item.version) === 'current') return record;
      await this.applyPluginPackage(hub, item, (version) =>
        checkHubFileVersion(record.name ?? pluginIdentifier, record.version, version, automatic)
      );
      const updated = await PluginService.markSynced(pluginIdentifier, item.version);
      await HubUpdateEventService.recordUpdated(eventItem('plugin', record), updated?.version, !automatic);
      return updated;
    } catch (err) {
      await this.noteUpdateProblem(eventItem('plugin', record), PluginService, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Background sync
  // ---------------------------------------------------------------------

  /** Records why an update didn't go in. A major version waiting for approval isn't a fault. */
  private static async noteUpdateProblem(
    item: HubEventItem,
    service: {
      setHubStatus: (identifier: string, status: 'ok' | 'missing' | 'error') => Promise<any>;
      setHubVersion: (identifier: string, hubVersion: string) => Promise<any>;
    },
    err: unknown
  ) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof HubUpdateHeldError && err.kind === 'major') {
      await service.setHubStatus(item.identifier, 'ok');
      // The file's version, not the catalog's: this is what the review offers and installs.
      await service.setHubVersion(item.identifier, err.fileVersion);
      await HubUpdateEventService.setAttention(item, { kind: 'major_waiting', toVersion: err.fileVersion });
      return;
    }
    await service.setHubStatus(item.identifier, 'error');
    await HubUpdateEventService.setAttention(
      item,
      err instanceof HubUpdateHeldError
        ? { kind: err.kind === 'unchanged' ? 'not_bumped' : 'blocked', toVersion: err.fileVersion, message }
        : { kind: 'failed', message }
    );
  }

  /**
   * Walks every locally-installed item *from this hub* (not the catalog) so a
   * catalog entry that disappeared is detectable — the old approach of only
   * iterating the catalog could never notice an item going missing, since a
   * missing item simply isn't there to iterate over.
   */
  private static async syncInstalledForType(
    hub: Hub,
    type: HubCatalogItemType,
    catalogMap: Map<string, HubCatalogItem>,
    service: {
      getInstalledForHub: (hubId: string) => Promise<any[]>;
      setHubVersion: (identifier: string, hubVersion: string) => Promise<any>;
      setHubStatus: (identifier: string, status: 'ok' | 'missing' | 'error') => Promise<any>;
    },
    hubIdentifierField: 'hub_task_identifier' | 'hub_app_identifier' | 'hub_plugin_identifier',
    applyUpdate: (identifier: string) => Promise<any>
  ) {
    const installed = await service.getInstalledForHub(hub.id);

    for (const record of installed) {
      const hubItemId = record[hubIdentifierField];
      const item = catalogMap.get(hubItemId);
      const eventTarget = eventItem(type, { ...record, hub_name: hub.name });

      if (!item) {
        // Removed from the hub's catalog — keep running exactly as installed,
        // just stop pretending it can still be checked for updates.
        if (record.hub_status !== 'missing') {
          await service.setHubStatus(record.identifier, 'missing');
        }
        await HubUpdateEventService.setAttention(eventTarget, null);
        continue;
      }

      try {
        if (semver.valid(item.version) && item.version !== record.hub_version) {
          await service.setHubVersion(record.identifier, item.version);
        }

        const state = hubUpdateState(record.version, item.version);
        if (state === 'available' && record.auto_update) {
          await applyUpdate(record.identifier);
        } else {
          await HubUpdateEventService.setAttention(eventTarget, attentionFor(state, item.version));
        }
        if (record.hub_status !== 'ok') {
          await service.setHubStatus(record.identifier, 'ok');
        }
      } catch (err: any) {
        // applyUpdate has recorded the reason and the item's status.
        if (!(err instanceof HubUpdateHeldError)) {
          console.error(
            `[HubSyncService] Failed to sync "${hubItemId}" from hub "${hub.name}":`,
            err.message ?? err
          );
        }
      }
    }
  }

  /**
   * What installing the hub's current version would change, for reviewing it first.
   * Nothing is installed. A plugin's package isn't opened, since loading it runs its code.
   */
  static async previewUpdate(type: HubCatalogItemType, identifier: string) {
    const service = { task: TaskService, app: AppService, plugin: PluginService }[type];
    const record: any = await service.getByIdentifier(identifier);
    const hubItemId = record?.hub_task_identifier ?? record?.hub_app_identifier ?? record?.hub_plugin_identifier;
    if (!record || record.source_type !== 'hub' || !record.hub_id || !hubItemId) {
      throw new Error(`"${identifier}" is not installed from a hub`);
    }

    const { hub, item } = await getHubAndItem(record.hub_id, hubItemId, type);
    const summary = { type, identifier, name: record.name, fromVersion: record.version ?? null, hubName: hub.name };

    if (type === 'task') {
      const file = await this.fetchAndValidateTask(hub, item);
      const toVersion = file.version ?? item.version;
      checkHubFileVersion(record.name, record.version, toVersion, false);
      return {
        ...summary,
        toVersion,
        state: hubUpdateState(record.version, toVersion),
        workflow: await workflowUpdateChanges(identifier, record.source, file),
      };
    }
    if (type === 'app') {
      const file = await this.fetchApp(hub, item);
      const toVersion = file.version ?? item.version;
      checkHubFileVersion(record.name, record.version, toVersion, false);
      return {
        ...summary,
        toVersion,
        state: hubUpdateState(record.version, toVersion),
        app: appUpdateChanges(record.source, file),
      };
    }
    // A package held back as major records its own version, which can differ from the catalog's.
    const toVersion = record.hub_version ?? item.version;
    return { ...summary, toVersion, state: hubUpdateState(record.version, toVersion) };
  }

  /** Says what happened; an unreachable hub is an answer, not an exception (the poller keeps going). */
  static async checkHub(hubId: string): Promise<HubCheckResult> {
    const hub = await HubService.getById(hubId);
    if (!hub) throw new Error(`Hub "${hubId}" not found`);

    let catalog: HubCatalogItem[];
    try {
      catalog = await HubProviderFactory.getProvider(hub).fetchCatalog(hub);
    } catch (err: any) {
      // Whole hub unreachable — leave every installed item's status alone. A
      // failed catalog fetch says nothing about whether any given item still
      // exists, so it must never be treated as "this item went missing."
      console.error(`[HubSyncService] Failed to fetch catalog for hub "${hub.name}":`, err.message ?? err);
      return { id: hub.id, name: hub.name, ok: false, error: err.message ?? String(err) };
    }

    const byType: Record<HubCatalogItemType, Map<string, HubCatalogItem>> = {
      task: new Map(),
      app: new Map(),
      plugin: new Map(),
    };
    for (const item of catalog) {
      byType[item.type]?.set(item.identifier, item);
    }

    await this.syncInstalledForType(hub, 'task', byType.task, TaskService, 'hub_task_identifier', (id) =>
      this.updateTask(id, { automatic: true })
    );
    await this.syncInstalledForType(hub, 'app', byType.app, AppService, 'hub_app_identifier', (id) =>
      this.updateApp(id, { automatic: true })
    );
    await this.syncInstalledForType(hub, 'plugin', byType.plugin, PluginService, 'hub_plugin_identifier', (id) =>
      this.updatePlugin(id, { automatic: true })
    );

    await HubService.markChecked(hub.id);
    return { id: hub.id, name: hub.name, ok: true, items: catalog.length };
  }

  static async checkAllHubs(): Promise<HubCheckResult[]> {
    const hubs = await HubService.listEnabled();
    const results: HubCheckResult[] = [];
    for (const hub of hubs) {
      results.push(await this.checkHub(hub.id));
    }
    return results;
  }
}

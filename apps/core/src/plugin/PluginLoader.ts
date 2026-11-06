import os from 'os';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import type { ZodTypeAny } from 'zod';
import { buildPluginSchema } from '@tipeline/schemas';
import { PluginService } from '@database/services/PluginService';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { PluginParamsRegistry } from '@/plugin/PluginParamsRegistry';
import { PluginDocsRegistry } from '@/plugin/PluginDocsRegistry';
import { PluginRulesRegistry } from '@/plugin/PluginRulesRegistry';
import { PluginSchemaRegistry } from '@/plugin/PluginSchemaRegistry';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';
import { PluginCacheableRegistry } from '@/plugin/PluginCacheableRegistry';

export const PLUGINS_DIR = path.join(os.homedir(), '.tipeline', 'plugins');
/** Where hub packages are built before they replace an installed plugin. Never scanned. */
export const PLUGIN_STAGING_DIR = '.staging';

export class PluginLoader {
  static async load() {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== PLUGIN_STAGING_DIR);

    const active: { path: string; group: string }[] = [];
    for (const dir of dirs) {
      const pluginPath = path.join(PLUGINS_DIR, dir.name);
      const group = await this.loadPlugin(pluginPath);
      if (group) active.push({ path: pluginPath, group });
    }

    // Plugins a prior scan registered but this one didn't reconfirm: their
    // folder was deleted, or its exported `group` changed. Flag them
    // `missing` (the row stays, listed, for an explicit remove/restore —
    // see PluginService.markMissingByGroups) and drop their in-memory
    // registrations, since the code backing them is no longer reachable.
    const activeKeys = new Set(active.map((a) => `${a.path}::${a.group}`));
    const known = await PluginService.getAll();
    const newlyMissing = known.filter(
      (p) => p.status !== 'missing' && !activeKeys.has(`${p.path}::${p.group}`)
    );
    for (const plugin of newlyMissing) {
      delete PluginActionRegistry[plugin.group];
      delete PluginParamsRegistry[plugin.group];
      delete PluginDocsRegistry[plugin.group];
      delete PluginRulesRegistry[plugin.group];
      delete PluginSchemaRegistry[plugin.group];
      delete PluginReturnsRegistry[plugin.group];
      delete PluginCacheableRegistry[plugin.group];
    }
    await PluginService.markMissingByGroups(newlyMissing.map((p) => p.group));
  }

  static async reloadSingle(pluginPath: string): Promise<string | null> {
    return await this.loadPlugin(pluginPath, true);
  }

  /** Reads a package's group and version without registering anything. Its code does run. */
  static async inspect(pluginPath: string): Promise<{ group: string; version?: string } | null> {
    const entryFile = this.resolveEntry(pluginPath);
    if (!entryFile) return null;
    const mod = await import(pathToFileURL(entryFile).href);
    const definition = mod.default ?? mod;
    if (!definition.group || typeof definition.actions !== 'object') return null;
    return { group: definition.group, version: definition.version };
  }

  /** `fresh` skips Node's module cache: an updated plugin keeps its path but has new code. */
  private static async loadPlugin(pluginPath: string, fresh = false): Promise<string | null> {
    const entryFile = this.resolveEntry(pluginPath);
    if (!entryFile) {
      console.warn(`[PluginLoader] No index.js/index.mjs found in ${pluginPath}, skipping`);
      return null;
    }

    try {
      const url = pathToFileURL(entryFile).href;
      const mod = await import(fresh ? `${url}?v=${Date.now()}` : url);
      const definition = mod.default ?? mod;

      if (!definition.group || typeof definition.actions !== 'object') {
        console.warn(`[PluginLoader] Plugin at ${pluginPath} must export { group, actions }, skipping`);
        return null;
      }

      // Look up any prior record before syncing, so we know both (a) whether
      // this is a brand-new discovery (registered disabled by default) vs. a
      // known plugin whose enabled/disabled state a user already chose, and
      // (b) whether the group is already claimed by a DIFFERENT plugin
      // folder — a plugin-vs-plugin name collision, which must never
      // overwrite that other plugin's registration.
      const record = await PluginService.getByGroup(definition.group);
      if (record && record.path !== pluginPath) {
        console.warn(
          `[PluginLoader] Plugin group "${definition.group}" at ${pluginPath} conflicts with an already-registered plugin at ${record.path}, skipping`
        );
        return null;
      }

      // Sync metadata to DB — this both lists new plugins in the Plugins
      // page (disabled by default) and refreshes metadata for known ones,
      // without touching their existing enabled state.
      await PluginService.registerOrUpdate({
        group: definition.group,
        name: definition.name ?? definition.group,
        description: definition.description,
        author: definition.author,
        version: definition.version,
        path: pluginPath,
        image: this.resolveImage(pluginPath, definition.image),
      });

      if (!record || !record.enabled) {
        console.log(
          record
            ? `[PluginLoader] Plugin "${definition.group}" is disabled, skipping`
            : `[PluginLoader] Discovered new plugin "${definition.group}", registered disabled by default`
        );
        return definition.group;
      }

      // Register actions into the plugin-only registry (kept separate from
      // ActionRegistry, which stays a static, core-only map)
      PluginActionRegistry[definition.group] = definition.actions;

      // Register optional param metadata
      if (definition.params && typeof definition.params === 'object') {
        PluginParamsRegistry[definition.group] = definition.params;
      }

      // Register optional per-action docs (description/example shown in the builder UI)
      if (definition.docs && typeof definition.docs === 'object') {
        PluginDocsRegistry[definition.group] = definition.docs;
      }

      // Register optional cross-field rules (e.g. "require ccEmail when sendCopy is true")
      if (definition.rules && typeof definition.rules === 'object') {
        PluginRulesRegistry[definition.group] = definition.rules;
      }

      // Register optional per-action output types (used to filter/validate the
      // "destination" variable a plugin action's result is written into).
      // An action omitted here (or the whole export omitted) is treated as 'any'.
      if (definition.returns && typeof definition.returns === 'object') {
        PluginReturnsRegistry[definition.group] = definition.returns;
      }

      // Register the actions the plugin says can be cached (see PluginCacheableRegistry).
      if (Array.isArray(definition.cacheable)) {
        PluginCacheableRegistry[definition.group] = {
          version: String(definition.version ?? ''),
          actions: definition.cacheable.filter((name: unknown) => typeof name === 'string'),
        };
      } else {
        delete PluginCacheableRegistry[definition.group];
      }

      // Build and cache a real Zod schema per action, derived from its param
      // defs (+ rules) — this is what ActionFactory enforces at execution
      // time for every invocation path, and what the Desktop builder derives
      // the identical schema from locally (via the same buildPluginSchema
      // function) for live form validation.
      const schemasForGroup: Record<string, ZodTypeAny> = {};
      const paramsByAction = definition.params ?? {};
      const rulesByAction = definition.rules ?? {};
      for (const actionName of Object.keys(definition.actions)) {
        if (!paramsByAction[actionName]) continue;
        schemasForGroup[actionName] = buildPluginSchema(
          paramsByAction[actionName],
          rulesByAction[actionName]
        );
      }
      PluginSchemaRegistry[definition.group] = schemasForGroup;

      console.log(`[PluginLoader] Loaded plugin "${definition.group}" from ${pluginPath}`);
      return definition.group;
    } catch (err) {
      console.error(`[PluginLoader] Failed to load plugin at ${pluginPath}:`, err);
      return null;
    }
  }

  /**
   * A plugin's `image` is either a remote URL, or a path relative to its own
   * folder — resolved here to a path relative to `~/.tipeline` (matching how
   * App/Task images are stored) so the same `tipeline-asset://` protocol
   * handler can serve it.
   */
  private static resolveImage(pluginPath: string, image?: string): string | undefined {
    if (!image) return undefined;
    if (/^https?:\/\//.test(image)) return image;
    const absolute = path.join(pluginPath, image);
    return path.relative(path.dirname(PLUGINS_DIR), absolute);
  }

  private static resolveEntry(pluginPath: string): string | null {
    for (const name of ['index.mjs', 'index.js']) {
      const full = path.join(pluginPath, name);
      if (fs.existsSync(full)) return full;
    }
    return null;
  }
}

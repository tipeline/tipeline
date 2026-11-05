import { readableValidationError } from '@utils/readableError';
import { Action } from '@action/Action';
import { getValidation } from '@tipeline/schemas';
import { safeClone } from '@utils/safeClone';
import { PluginActionRegistry } from '@/plugin/PluginActionRegistry';
import { PluginSchemaRegistry } from '@/plugin/PluginSchemaRegistry';
import { PluginService } from '@database/services/PluginService';

export class ActionFactory {
  static async create(rawAction: any): Promise<Action> {
    console.log(`[ActionFactory] create: ${rawAction.group}.${rawAction.name}`);
    let validator: any = null;
    let pluginSchema: any = null;
    const isPluginAction = rawAction.source === 'plugin';

    const resolveAsPlugin = async () => {
      if (!PluginActionRegistry[rawAction.group]) {
        throw new Error(await ActionFactory.describeUnavailable(rawAction.group, rawAction.name));
      }
      console.log(`[ActionFactory] plugin group "${rawAction.group}" found in registry, proceeding`);
      // Plugin actions get their params enforced too, via a schema PluginLoader
      // already derived (or was handed) for this action — same enforcement
      // seam as built-ins, just a different schema source.
      pluginSchema = PluginSchemaRegistry[rawAction.group]?.[rawAction.name] ?? null;
    };

    if (isPluginAction) {
      // Explicitly tagged — a same-named core group may exist, so never
      // attempt the core lookup at all (it could succeed against the wrong
      // group).
      await resolveAsPlugin();
    } else {
      try {
        validator = getValidation(rawAction.group, rawAction.name, 'creation');
        console.log(`[ActionFactory] validator found for ${rawAction.group}.${rawAction.name}`);
      } catch {
        // Not a built-in group (or an untagged legacy plugin action) —
        // require it to be a registered plugin
        console.log(`[ActionFactory] no schema for ${rawAction.group}.${rawAction.name}, checking PluginActionRegistry...`);
        console.log(`[ActionFactory] PluginActionRegistry keys:`, Object.keys(PluginActionRegistry));
        await resolveAsPlugin();
      }
    }

    // We need to preserve the original values and
    // do not lose any variable like this {= hello =}
    // safeClone is used instead of structuredClone because params may hold
    // runtime objects (e.g. Knex instances).
    const originalParams = safeClone(rawAction.params);

    // Validate the parameters using the parsed values (skipped for plugin
    // groups with no registered schema — e.g. a plugin with no params array)
    try {
      validator?.validate(rawAction.params ?? {});
      pluginSchema?.parse(rawAction.params ?? {});
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.trim().startsWith('[')) {
        throw new Error(`${rawAction.group}.${rawAction.name}: ${readableValidationError(error.message)}`);
      }
      throw error;
    }

    const newAction = new Action({
      group: rawAction.group,
      name: rawAction.name,
      params: originalParams,
      destination: rawAction.destination,
      id: rawAction.id,
      identifier: rawAction.identifier,
      onError: rawAction.onError,
      disabled: rawAction.disabled ?? false,
      source: rawAction.source,
      cache: rawAction.cache,
    });

    return newAction;
  }

  // Same "does this action type exist" lookup `create()` uses to decide
  // whether to throw, but as a plain boolean and without constructing
  // anything. A plugin group that's merely disabled/missing/in conflict still
  // counts as known here — that's a recoverable runtime state (the canvas
  // already flags it inline), not a bogus/typo'd group — so only a group with
  // no schema, no live registration, AND no plugin record at all is unknown.
  static async actionTypeIsKnown(group: string, name: string, source?: 'plugin'): Promise<boolean> {
    if (source === 'plugin') {
      if (PluginActionRegistry[group]) return true;
      return !!(await PluginService.getByGroup(group));
    }
    try {
      getValidation(group as any, name, 'creation');
      return true;
    } catch {
      if (PluginActionRegistry[group]) return true;
      return !!(await PluginService.getByGroup(group));
    }
  }

  // A missing PluginActionRegistry entry can mean the group was never a plugin at
  // all, or that it once was but its plugin is now missing/disabled/in
  // conflict — those cases deserve a more useful message than a bare
  // "unknown action", since the fix differs (restore the folder, re-enable
  // it, or rename the group).
  private static async describeUnavailable(group: string, name: string): Promise<string> {
    const key = `${group}.${name}`;
    const plugin = await PluginService.getByGroup(group);
    if (!plugin) return `Unknown action: ${key}`;
    if (plugin.status === 'missing') {
      return `Unknown action: ${key} — plugin "${plugin.name}" is missing (its folder could not be found at ${plugin.path})`;
    }
    if (plugin.status === 'conflict') {
      return `Unknown action: ${key} — plugin "${plugin.name}" could not be loaded (its group "${group}" conflicts with a built-in action group)`;
    }
    if (!plugin.enabled) {
      return `Unknown action: ${key} — plugin "${plugin.name}" is disabled`;
    }
    return `Unknown action: ${key}`;
  }
}

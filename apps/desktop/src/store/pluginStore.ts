import { defineStore } from 'pinia';
import type { ZodTypeAny } from 'zod';
import type { PluginActionDocs, PluginParamDef, PluginFieldRule, VariableType } from '@tipeline/types';
import { buildPluginSchema } from '@tipeline/schemas';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';

export type { PluginActionDocs, PluginParamDef, PluginFieldRule };

export const usePluginStore = defineStore('pluginStore', {
  state: () => ({
    pluginParams: {} as Record<string, Record<string, PluginParamDef[]>>,
    pluginDocs: {} as Record<string, Record<string, PluginActionDocs>>,
    pluginRules: {} as Record<string, Record<string, PluginFieldRule[]>>,
    pluginReturns: {} as Record<string, Record<string, VariableType | 'any'>>,
    // The actions each plugin says can be cached (its `cacheable` export).
    pluginCacheable: {} as Record<string, string[]>,
    enabledPluginGroups: [] as string[],
    // Count of plugins whose status isn't 'ok' (missing folder, group
    // conflict) — surfaced as a nav badge so problems are visible from any
    // page, not just when the user happens to open the Plugins page.
    attentionCount: 0,
    currentPlugin: { name: '' },
    // Schemas are derived (not IPC data) so they're cached separately,
    // keyed by "group.action", rebuilt only when register()/registerRules()
    // touch that group.
    schemaCache: {} as Record<string, ZodTypeAny>,
  }),
  actions: {
    register(group: string, params: Record<string, PluginParamDef[]>) {
      this.pluginParams[group] = params;
      this.invalidateGroupSchemas(group);
    },
    registerDocs(group: string, docs: Record<string, PluginActionDocs>) {
      this.pluginDocs[group] = docs;
    },
    registerRules(group: string, rules: Record<string, PluginFieldRule[]>) {
      this.pluginRules[group] = rules;
      this.invalidateGroupSchemas(group);
    },
    registerReturns(group: string, returns: Record<string, VariableType | 'any'>) {
      this.pluginReturns[group] = returns;
    },
    registerCacheable(group: string, actions: string[] | undefined) {
      this.pluginCacheable[group] = Array.isArray(actions) ? actions : [];
    },
    invalidateGroupSchemas(group: string) {
      for (const key of Object.keys(this.schemaCache)) {
        if (key.startsWith(`${group}.`)) delete this.schemaCache[key];
      }
    },
    setEnabledGroups(groups: string[]) {
      this.enabledPluginGroups = groups;
    },
    getActionDefs(group: string, actionName: string): PluginParamDef[] {
      return this.pluginParams[group]?.[actionName] ?? [];
    },
    getActionDocs(group: string, actionName: string): PluginActionDocs | undefined {
      return this.pluginDocs[group]?.[actionName];
    },
    getActionRules(group: string, actionName: string): PluginFieldRule[] {
      return this.pluginRules[group]?.[actionName] ?? [];
    },
    getActionReturns(group: string, actionName: string): VariableType | 'any' {
      return this.pluginReturns[group]?.[actionName] ?? 'any';
    },
    isActionCacheable(group: string, actionName: string): boolean {
      return this.pluginCacheable[group]?.includes(actionName) ?? false;
    },
    // Builds (and caches) the same Zod schema PluginLoader builds in Core for
    // this action — real, live, client-side validation with no IPC round
    // trip, since both sides derive it from the identical PluginParamDef[]/
    // PluginFieldRule[] JSON.
    getActionSchema(group: string, actionName: string): ZodTypeAny {
      const key = `${group}.${actionName}`;
      if (!this.schemaCache[key]) {
        this.schemaCache[key] = buildPluginSchema(
          this.getActionDefs(group, actionName),
          this.getActionRules(group, actionName)
        );
      }
      return this.schemaCache[key];
    },
    setCurrentPlugin(plugin: { name: string }) {
      this.currentPlugin = plugin;
    },
    async refreshAttentionCount() {
      try {
        const plugins = await invokeCore<{ status: string }[]>(SEND.PLUGIN_LIST);
        this.attentionCount = (plugins ?? []).filter((p) => p.status !== 'ok').length;
      } catch {
        // Leave the last known count on a transient IPC failure rather than
        // clearing a real signal.
      }
    },
  },
});

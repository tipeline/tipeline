import { useI18n } from 'vue-i18n';
import { getAllValidations } from '@tipeline/schemas';

// Plugin action groups (e.g. a "googledocs" plugin) carry their own
// label/description via the plugin's `docs`, not vue-i18n translation
// files — only built-in groups have entries under actions.*.  Looking a
// key up for a plugin group would always miss and log an intlify
// "not found" warning even though the caller correctly falls back, so
// skip the lookup entirely for anything that isn't a built-in group.
const builtinGroups = new Set(Object.keys(getAllValidations()));

export function useActionT() {
  const { t } = useI18n({ useScope: 'global' });

  function tGroup(group: string): string {
    if (!builtinGroups.has(group)) return group;
    const key = `actions.${group}.label`;
    const result = t(key);
    return result !== key ? result : group;
  }

  function tAction(group: string, action: string): string {
    if (!builtinGroups.has(group)) return action;
    const key = `actions.${group}.actions.${action}.label`;
    const result = t(key);
    return result !== key ? result : action;
  }

  function tActionDescription(group: string, action: string): string {
    if (!builtinGroups.has(group)) return '';
    const key = `actions.${group}.actions.${action}.description`;
    const result = t(key);
    return result !== key ? result : '';
  }

  function tFieldConfig(
    group: string,
    action: string,
    original?: Record<string, { component?: string; label?: string; description?: string }>
  ): Record<string, any> | undefined {
    if (!original) return undefined;
    const isBuiltin = builtinGroups.has(group);
    const result: Record<string, any> = {};
    for (const [field, config] of Object.entries(original)) {
      result[field] = { ...config };
      if (!isBuiltin) continue;
      const lk = `actions.${group}.actions.${action}.fields.${field}.label`;
      const dk = `actions.${group}.actions.${action}.fields.${field}.description`;
      const lt = t(lk);
      const dt = t(dk);
      if (lt !== lk) result[field].label = lt;
      if (dt !== dk) result[field].description = dt;
    }
    return result;
  }

  return { tGroup, tAction, tActionDescription, tFieldConfig };
}

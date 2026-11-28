import type { Ref } from 'vue';
import { computed, inject, toValue, type MaybeRefOrGetter } from 'vue';
import { useI18n } from 'vue-i18n';
import { matchesVariableType } from '@/components/ui/auto-form/utils';
import { valuePaths, type ExpressionSuggestion } from '@/utils/expressionField';
import { RUN_BUILT_INS } from '@/utils/templateReferences';
import { useEnvFileNames } from '@/composables/useEnvFileNames';
import { getActivePinia } from 'pinia';
import { useConnectionStore } from '@/store/connectionStore';

/**
 * What a workflow action field can reference, for its `{}` menu and `{{` autocomplete:
 * the variables the action editor provides (`taskVariables`), plus the fields inside
 * object/list ones (`customer.address.city`), each checked against `variableType`.
 * Undefined outside the action editor (nothing provided) — no menu, no autocomplete.
 *
 * Objects and lists work like folders: a nested field sits under its parent and comes up
 * only once the parent is opened (the `{}` menu) or its dot typed (autocomplete), so big
 * objects never flood the top level.
 * - fits the field's type: pickable.
 * - doesn't fit, but has fields inside that do: a container — opening it shows them,
 *   with how many fit as its hint. One with nothing that fits is left out.
 * - an object/list whose contents aren't known yet (no run, no declared value): shown
 *   dimmed with a hint to run once, since what's inside can't be checked.
 * - a field inside an open object that doesn't fit: dimmed, so `{= customer.` still
 *   shows everything that's there.
 */
export function useVariableSuggestions(
  variableType: MaybeRefOrGetter<string | string[] | undefined> = undefined
) {
  const { t } = useI18n();
  const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null);
  // Object and list variables' known values (last run, else declared), by variable name.
  const taskVariableValues = inject<Ref<Record<string, unknown>> | null>('taskVariableValues', null);
  const envNames = useEnvFileNames();
  // On a Tipeline Server, runs read the server's environment, which this computer can't see.
  const connection = getActivePinia() ? useConnectionStore() : null;

  return computed<ExpressionSuggestion[] | undefined>(() => {
    if (!taskVariables) return undefined;
    const wanted = toValue(variableType);
    const wantedTypes = Array.isArray(wanted) ? wanted.join(' / ') : (wanted ?? '');
    const fits = (type: string) => matchesVariableType(type, wanted);
    const out: ExpressionSuggestion[] = [];
    const containerDetail = (type: string, count: number) =>
      t('expressionInput.containerFields', { type, count }, count);
    // A list shows its first item, as the shape every item has — but picking `list[0]…`
    // means that one item, so it says so, and how to work with every item instead.
    const everyItem = t('expressionInput.everyItemNote');
    const asItem = (field: { path: string; parent: string }, detail: string) =>
      field.path === `${field.parent}[0]`
        ? { detail: t('expressionInput.firstItem', { detail }), note: everyItem }
        : { detail };
    for (const v of taskVariables.value) {
      const value = taskVariableValues?.value[v.name];
      const fields = value === undefined ? [] : valuePaths(v.name, value);
      // How many fitting fields each path holds, anywhere below it.
      const parents = new Map(fields.map((f) => [f.path, f.parent]));
      const fitting = new Map<string, number>();
      for (const f of fields) {
        if (!fits(f.type)) continue;
        for (let p: string | undefined = f.parent; p !== undefined; p = parents.get(p))
          fitting.set(p, (fitting.get(p) ?? 0) + 1);
      }
      const inside = (path: string) => fitting.get(path) ?? 0;
      if (fits(v.type)) out.push({ path: v.name, detail: v.type });
      else if (inside(v.name) > 0)
        out.push({ path: v.name, detail: containerDetail(v.type, inside(v.name)), container: true });
      else {
        if (value === undefined && (v.type === 'object' || v.type === 'array'))
          out.push({
            path: v.name,
            detail: t('expressionInput.unknownFields', { type: v.type }),
            disabled: true,
          });
        continue;
      }
      for (const field of fields) {
        const nested = { path: field.path, parent: field.parent };
        if (fits(field.type)) out.push({ ...nested, ...asItem(field, field.type) });
        else if (inside(field.path) > 0)
          out.push({
            ...nested,
            ...asItem(field, containerDetail(field.type, inside(field.path))),
            container: true,
          });
        else
          out.push({
            ...nested,
            ...asItem(field, t('expressionInput.wrongType', { type: field.type, wanted: wantedTypes })),
            disabled: true,
          });
      }
    }
    // This run and the Core running it: folders of text fields, after the workflow's own.
    if (fits('string')) {
      for (const [root, fields] of Object.entries(RUN_BUILT_INS)) {
        out.push({ path: root, detail: t(`expressionInput.builtIn${root}`), container: true });
        for (const field of fields)
          out.push({ path: `${root}.${field}`, parent: root, detail: t(`expressionInput.builtInField.${root}.${field}`) });
      }
      // The names in ~/.tipeline/.env. Empty: still listed, dimmed, to say where they come from.
      if (!connection?.isRemote) {
        if (envNames.value.length) {
          out.push({ path: '_env', detail: t('expressionInput.builtIn_env'), container: true });
          for (const name of envNames.value)
            out.push({ path: `_env.${name}`, parent: '_env', detail: t('expressionInput.envValue') });
        } else {
          out.push({ path: '_env', detail: t('expressionInput.envEmpty'), disabled: true });
        }
      }
    }
    return out;
  });
}

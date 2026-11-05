import { getValidation } from '@tipeline/schemas';
import { findTemplateTokens, templateTagSourceNames } from '@/utils/templateReferences';

export interface VariableUsageLocation {
  actionIdentifier?: string;
  label: string;
}

function actionLabel(action: any): string {
  if (action?.label) return action.label;
  if (action?.group && action?.name) return `${action.group}.${action.name}`;
  return action?.name ?? action?.identifier ?? 'action';
}

/**
 * Walks a task's pipeline actions (including nested control-flow bodies under
 * params.actions, same recursion used by useActionManipulation.ts) and builds
 * a variable name -> usage locations index in one pass.
 *
 * Four kinds of reference count as "usage":
 *  - `{{ name }}` / `{= name =}` tokens anywhere in an action's params (a
 *    read) — matched against the base name, so `{{ newDoc.id }}` counts as
 *    using `newDoc`, not a variable literally named "newDoc.id".
 *  - `{% for x in name %}` loop sources (also a read) — `name` is the thing
 *    being iterated, distinct from the loop-local `x`.
 *  - `action.destination` (a write) — the generic "save this action's result
 *    into a variable" field every action type supports (Action.ts), which
 *    lives as a sibling of `params`, not inside it, and holds a bare
 *    variable name rather than a `{{ }}` token. `_global.x` destinations are
 *    excluded — those write to a global variable, not a task one.
 *  - `params` fields the schema marks `component: 'variable-select'` (also a
 *    write) — e.g. forEachLoop's `currentItem`/`indexVariable`, simpleLoop's
 *    and conditionalLoop's `indexVariable`. These bind an existing task
 *    variable by bare name too, same shape as `destination`, just nested
 *    inside `params` instead of next to it — so they need the schema's
 *    fieldConfig to find them instead of a fixed key.
 *
 * This is the "light path" from the reference-tracking design: usage is
 * derived from the plain strings already stored, not from any typed
 * reference — so it works against today's task source with no schema change.
 */
export function buildVariableUsageIndex(actions: unknown): Map<string, VariableUsageLocation[]> {
  const index = new Map<string, VariableUsageLocation[]>();
  if (!Array.isArray(actions)) return index;

  function addUsage(name: string, location: VariableUsageLocation) {
    const list = index.get(name);
    if (list) list.push(location);
    else index.set(name, [location]);
  }

  function walk(list: any[]) {
    for (const action of list) {
      const text = JSON.stringify(action?.params ?? {});
      const namesInAction = new Set<string>();
      for (const token of findTemplateTokens(text)) {
        namesInAction.add(token.name);
      }
      for (const name of templateTagSourceNames(text)) {
        namesInAction.add(name);
      }
      if (typeof action?.destination === 'string' && action.destination && !action.destination.startsWith('_global.')) {
        namesInAction.add(action.destination);
      }
      if (action?.group && action?.name) {
        let fieldConfig: Record<string, any> | undefined;
        if (action.source === 'plugin') {
          fieldConfig = undefined;
        } else {
          try {
            fieldConfig = getValidation(action.group, action.name, 'creation')?.fieldConfig;
          } catch {
            fieldConfig = undefined;
          }
        }
        if (fieldConfig) {
          for (const [field, config] of Object.entries(fieldConfig)) {
            if (config?.component !== 'variable-select') continue;
            const value = action?.params?.[field];
            if (typeof value === 'string' && value) namesInAction.add(value);
          }
        }
      }
      if (namesInAction.size > 0) {
        const location: VariableUsageLocation = {
          actionIdentifier: action?.identifier,
          label: actionLabel(action),
        };
        for (const name of namesInAction) addUsage(name, location);
      }
      if (Array.isArray(action?.params?.actions)) walk(action.params.actions);
    }
  }

  walk(actions as any[]);
  return index;
}

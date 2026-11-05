import { getValidation, buildPluginSchema } from '@tipeline/schemas';
import type { PluginParamDef, PluginFieldRule } from '@tipeline/types';

// Treats empty/blank strings as missing so required string fields are caught.
// Only applies to the top level — nested arrays/objects (params.actions etc.)
// are not part of creation schemas and don't need preprocessing.
export function preprocessParams(params: any): any {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return result;
}

// Validates against the same Zod schema PluginLoader derives in Core (built
// locally here from the identical PluginParamDef[]/PluginFieldRule[] JSON) —
// real enum/pattern/min/max/cross-field checks, not just "is it empty".
export function pluginActionHasErrors(
  params: any,
  defs: PluginParamDef[],
  rules: PluginFieldRule[] = []
): boolean {
  return !buildPluginSchema(defs, rules).safeParse(preprocessParams(params ?? {})).success;
}

export const ORDERING_RULES: Record<string, { validPrev: string[] }> = {
  elseIfConditional:  { validPrev: ['ifConditional', 'elseIfConditional'] },
  elseConditional:    { validPrev: ['ifConditional', 'elseIfConditional'] },
  caseConditional:    { validPrev: ['switchConditional', 'caseConditional'] },
  defaultConditional: { validPrev: ['switchConditional', 'caseConditional'] },
};

// Returns the identifiers of actions that are in an invalid position within a flat list.
export function getOrderingErrorIds(actionList: any[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < actionList.length; i++) {
    const name = actionList[i].name;
    if (!Object.hasOwn(ORDERING_RULES, name)) continue;
    const rule = ORDERING_RULES[name];
    const prev = i > 0 ? actionList[i - 1] : null;
    if (!prev || !rule.validPrev.includes(prev.name)) {
      errors.push(actionList[i].identifier);
    }
  }
  return errors;
}

// Returns identifiers of actions in a flat list whose params fail their creation schema.
export function getFieldErrorIds(
  actionList: any[],
  pluginParams: Record<string, Record<string, PluginParamDef[]>> = {},
  pluginRules: Record<string, Record<string, PluginFieldRule[]>> = {}
): string[] {
  const errors: string[] = [];
  for (const action of actionList) {
    if (!action.identifier || !action.group || !action.name) continue;
    try {
      const validator = getValidation(action.group, action.name, 'creation');
      if (!validator.schema.safeParse(preprocessParams(action.params ?? {})).success) {
        errors.push(action.identifier);
      }
    } catch {
      const defs = pluginParams[action.group]?.[action.name];
      const rules = pluginRules[action.group]?.[action.name];
      if (defs && pluginActionHasErrors(action.params, defs, rules)) {
        errors.push(action.identifier);
      }
    }
  }
  return errors;
}

// Returns true if an action's params fail its creation schema.
export function actionHasFieldErrors(
  action: any,
  pluginParams: Record<string, Record<string, PluginParamDef[]>> = {},
  pluginRules: Record<string, Record<string, PluginFieldRule[]>> = {}
): boolean {
  if (!action?.group || !action?.name) return false;
  try {
    const validator = getValidation(action.group, action.name, 'creation');
    return !validator.schema.safeParse(preprocessParams(action.params ?? {})).success;
  } catch {
    const defs = pluginParams[action.group]?.[action.name];
    const rules = pluginRules[action.group]?.[action.name];
    return defs ? pluginActionHasErrors(action.params, defs, rules) : false;
  }
}

/**
 * Every action in the tree whose params fail its schema (built-in or plugin), in
 * order — the steps someone has to finish in the builder before the workflow runs.
 */
export function flowFieldErrorActions(
  actions: any[],
  pluginParams: Record<string, Record<string, PluginParamDef[]>> = {},
  pluginRules: Record<string, Record<string, PluginFieldRule[]>> = {}
): any[] {
  if (!Array.isArray(actions)) return [];
  const found: any[] = [];
  for (const action of actions) {
    if (actionHasFieldErrors(action, pluginParams, pluginRules)) found.push(action);
    found.push(...flowFieldErrorActions(action.params?.actions, pluginParams, pluginRules));
    found.push(...flowFieldErrorActions(action.params?.steps, pluginParams, pluginRules));
  }
  return found;
}

// Recursively checks whether any action in the tree has an ordering error.
export function hasFlowOrderingErrors(actions: any[]): boolean {
  if (!Array.isArray(actions)) return false;
  for (let i = 0; i < actions.length; i++) {
    const name = actions[i].name;
    if (Object.hasOwn(ORDERING_RULES, name)) {
      const rule = ORDERING_RULES[name];
      const prev = i > 0 ? actions[i - 1] : null;
      if (!prev || !rule.validPrev.includes(prev.name)) return true;
    }
    if (hasFlowOrderingErrors(actions[i].params?.actions)) return true;
    if (hasFlowOrderingErrors(actions[i].params?.steps)) return true;
  }
  return false;
}

// Recursively checks whether any action in the tree fails its schema (built-in or plugin).
export function hasFlowFieldErrors(
  actions: any[],
  pluginParams: Record<string, Record<string, PluginParamDef[]>> = {},
  pluginRules: Record<string, Record<string, PluginFieldRule[]>> = {}
): boolean {
  if (!Array.isArray(actions)) return false;
  for (const action of actions) {
    if (actionHasFieldErrors(action, pluginParams, pluginRules)) return true;
    if (hasFlowFieldErrors(action.params?.actions, pluginParams, pluginRules)) return true;
    if (hasFlowFieldErrors(action.params?.steps, pluginParams, pluginRules)) return true;
  }
  return false;
}

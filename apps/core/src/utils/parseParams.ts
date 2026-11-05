import { Liquid } from 'liquidjs';

const liquid = new Liquid({ strictVariables: false });

// Disable file-system / web-layout tags — they are irrelevant in Tipeline and
// could silently read from disk if a root is ever configured.
const disabledTags = ['layout', 'include', 'render', 'extends', 'block'];
for (const tag of disabledTags) {
  liquid.registerTag(tag, {
    parse() {},
    render() {
      throw new Error(`The '${tag}' tag is not supported in Tipeline templates.`);
    },
  });
}

/**
 * Renders a Liquid template with `data` — the same engine (and disabled tags) as step
 * params. Used by string.renderTemplate for templates kept as data (a variable), which
 * params rendering leaves alone.
 */
export function renderLiquid(template: string, data: Record<string, unknown>): string {
  return liquid.parseAndRenderSync(template, data);
}

// Walks a leading sequence of `.prop` / `[index]` segments against `root`.
function resolvePath(root: any, path: string): any {
  let result = root;
  const segRegex = /\.([^.\[\]]+)|\[(\d+)\]/g;
  let m;
  while ((m = segRegex.exec(path)) !== null) {
    if (result == null) return undefined;
    result = m[1] !== undefined ? result[m[1]] : result[parseInt(m[2], 10)];
  }
  return result;
}

/**
 * Parses params object and resolves variable placeholders in string values.
 * Supports two syntaxes:
 *   - {= var =}          → raw variable injection (preserves original type, must be the entire value)
 *   - {= _env.KEY =}     → raw env variable injection
 *   - {= _global.name =} → raw global variable injection
 *   - {= _previous =}    → raw injection of the previous action's result in this block
 *   - LiquidJS           → {{ var }}, {{ _env.KEY }}, {{ _global.name }}, {{ _previous.field }}, {% if %}, filters, etc.
 */
function resolveString(
  value: string,
  variables: any[],
  getGlobalVar?: (name: string) => any,
  previousResult?: unknown
): any {
  // Raw injection: {= varName =} / {= _env.KEY =} / {= _global.varName =}
  // Must be the entire string value — preserves original type
  // Supports dot notation and array index notation: {= obj.list[0].prop =}
  const rawMatch = value.match(/^\{=\s*([\w.\[\]]+)\s*=\}$/);
  if (rawMatch) {
    const ref = rawMatch[1];
    if (ref.startsWith('_env.')) {
      return process.env[ref.slice(5)] ?? value;
    }
    if (ref.startsWith('_global.')) {
      return getGlobalVar ? (getGlobalVar(ref.slice(8)) ?? value) : value;
    }
    if (ref === '_previous' || ref.startsWith('_previous.') || ref.startsWith('_previous[')) {
      const path = ref.slice('_previous'.length);
      return (path ? resolvePath(previousResult, path) : previousResult) ?? value;
    }
    // Variable name ends at the first '.' or '['
    const dotIdx = ref.indexOf('.');
    const bracketIdx = ref.indexOf('[');
    const sepIdx =
      dotIdx === -1 ? bracketIdx
      : bracketIdx === -1 ? dotIdx
      : Math.min(dotIdx, bracketIdx);
    const varName = sepIdx === -1 ? ref : ref.slice(0, sepIdx);
    const variable = variables.find((v) => v.getName() === varName);
    if (!variable) return value;
    if (sepIdx === -1) return variable.getValue();
    const path = ref.slice(varName.length);
    return resolvePath(variable.getValue(), path) ?? value;
  }

  if (value.includes('{=')) {
    throw new Error(
      `[Error: Workflow] {= var =} must be used alone and not inside other strings: "${value}"`
    );
  }

  if (!value.includes('{{') && !value.includes('{%')) return value;

  const context: Record<string, any> = {};
  for (const variable of variables) {
    context[variable.getName()] = variable.getValue();
  }

  // _env namespace: {{ _env.KEY }} — resolved from process.env
  const envRefs = [...value.matchAll(/_env\.(\w+)/g)].map((m) => m[1]);
  if (envRefs.length) {
    context['_env'] = Object.fromEntries(envRefs.map((key) => [key, process.env[key] ?? '']));
  }

  // _global namespace: {{ _global.varName }} — resolved via getGlobalVar callback
  if (getGlobalVar) {
    const globalRefs = [...value.matchAll(/_global\.(\w+)/g)].map((m) => m[1]);
    if (globalRefs.length) {
      context['_global'] = Object.fromEntries(
        globalRefs.map((name) => [name, getGlobalVar(name) ?? ''])
      );
    }
  }

  // _previous: {{ _previous.field }} — the previous action's raw result in
  // this block (whatever that action returned, unresolved).
  if (/\b_previous\b/.test(value)) {
    context['_previous'] = previousResult;
  }

  return liquid.parseAndRenderSync(value, context);
}

export function parseParams(
  params: any,
  variables: any[],
  getGlobalVar?: (name: string) => any,
  previousResult?: unknown
) {
  if (!params) return;

  // Object.entries() works the same way on arrays (numeric string keys), so
  // this single branch recurses into both plain objects and array elements —
  // including objects/arrays nested inside an array, not just top-level ones.
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      params[key] = resolveString(value, variables, getGlobalVar, previousResult);
    } else if (value && typeof value === 'object') {
      parseParams(value, variables, getGlobalVar, previousResult);
    }
  }
}

// A flow step holds other steps under params.actions. They stay unresolved here:
// each one resolves its own params right before it runs (Block.updateActionParams),
// so it sees what the steps before it in the branch or loop body just set.
function flowBody(group: string, params: any): any[] | null {
  return group === 'flow' && Array.isArray(params?.actions) ? params.actions : null;
}

/** parseParams for a step's own params, leaving the steps inside a flow step alone. */
export function parseStepParams(
  group: string,
  params: any,
  variables: any[],
  getGlobalVar?: (name: string) => any,
  previousResult?: unknown
) {
  const body = flowBody(group, params);
  if (body) params.actions = undefined;
  parseParams(params, variables, getGlobalVar, previousResult);
  if (body) params.actions = body;
}

// `{= _global.x =}` and `{{ _global.x }}`. A `default` filter says the value is optional,
// and {% %} tags can test for it, so neither of those needs the global to exist.
const GLOBAL_READS = /\{=\s*_global\.(\w+)\s*=\}|\{\{\s*_global\.(\w+)((?:(?!\}\}).)*)\}\}/g;

/** The names of the globals a value needs, including inside objects and lists. */
export function globalsRead(value: unknown, names: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.matchAll(GLOBAL_READS)) {
      if (match[1]) names.add(match[1]);
      else if (!/\|\s*default\b/.test(match[3])) names.add(match[2]);
    }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) globalsRead(item, names);
  }
  return names;
}

/** The globals a step's own params need; the steps inside a flow step check theirs when they run. */
export function globalsReadByStep(group: string, params: any): string[] {
  const body = flowBody(group, params);
  return [...globalsRead(body ? { ...params, actions: undefined } : params)];
}

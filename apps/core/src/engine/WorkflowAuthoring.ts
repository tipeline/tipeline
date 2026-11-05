import type { ZodTypeAny } from 'zod';
import {
  getAvailableGroups,
  getGroupActionsMap,
  getGroupMeta,
  getValidation,
} from '@tipeline/schemas';
import { Parser } from '@utils/Parser';
import { TaskValidator } from '@validation/TaskValidation';
import { PluginParamsRegistry } from '@/plugin/PluginParamsRegistry';
import { PluginDocsRegistry } from '@/plugin/PluginDocsRegistry';
import { PluginReturnsRegistry } from '@/plugin/PluginReturnsRegistry';
import { PluginSchemaRegistry } from '@/plugin/PluginSchemaRegistry';
import { readableValidationError } from '@utils/readableError';
import { ACTION_EXAMPLES } from '@engine/actionExamples.generated';
import { declaredReturnType } from '@action/declaredReturnType';
import { coerceVariableValue } from '@utils/coerceVariableValue';
import { TaskService } from '@database/services/TaskService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { globalsRead } from '@utils/parseParams';
import { isDraft } from '@task/Draft';
import { parseHubWorkflowId, workflowInputs } from '@engine/WorkflowCatalog';

/**
 * What the assistant needs to write a workflow: which actions exist, what each
 * one takes, and a check of a written workflow that matches what a real run
 * checks — without saving anything.
 */

export interface ActionGroupSummary {
  group: string;
  label: string;
  plugin?: boolean;
  /** Each action with its one-line description, so the model can pick by what it does, not just its name. */
  actions: Array<{ name: string; description?: string }>;
}

export interface ActionField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface ActionDescription {
  action: string;
  label?: string;
  description?: string;
  returns?: string;
  fields: ActionField[];
  plugin?: boolean;
  /** A step using this action, from its docs. An illustration: its values and variable names are made up. */
  example?: string;
}

export interface WorkflowCheck {
  valid: boolean;
  /** Problems a run would stop on. */
  errors: string[];
  /** Things that are probably wrong but don't stop a run, like a template naming no variable. */
  warnings: string[];
}

// ---------------------------------------------------------------------
// Action catalog
// ---------------------------------------------------------------------

/** Every action group, built-in and plugin, with its actions and what each one does. */
export function listActionGroups(): ActionGroupSummary[] {
  const actions = getGroupActionsMap();
  const builtIn = getAvailableGroups().map((group) => {
    let label = group;
    try {
      label = getGroupMeta(group as any)?.label ?? group;
    } catch {
      // A group without meta keeps its key as the label.
    }
    return {
      group,
      label,
      actions: (actions[group] ?? []).map((name) => {
        let description: string | undefined;
        try {
          description = getValidation(group as any, name, 'creation')?.description;
        } catch {
          // No schema: list the name alone.
        }
        return description ? { name, description } : { name };
      }),
    };
  });
  const plugins = Object.entries(PluginParamsRegistry).map(([group, byAction]) => ({
    group,
    label: group,
    plugin: true,
    actions: Object.keys(byAction).map((name) => {
      const description = PluginDocsRegistry[group]?.[name]?.description;
      return description ? { name, description } : { name };
    }),
  }));
  return [...builtIn, ...plugins];
}

/** Peels off wrappers that don't change what a field accepts. */
function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let current: any = schema;
  for (let i = 0; i < 10 && current?._def; i++) {
    const { typeName } = current._def;
    if (typeName === 'ZodOptional' || typeName === 'ZodNullable' || typeName === 'ZodDefault' || typeName === 'ZodCatch') {
      current = current._def.innerType;
    } else if (typeName === 'ZodEffects') {
      current = current._def.schema;
    } else if (typeName === 'ZodBranded') {
      current = current._def.type;
    } else if (typeName === 'ZodLazy') {
      current = current._def.getter();
    } else if (typeName === 'ZodPipeline') {
      current = current._def.in;
    } else {
      break;
    }
  }
  return current;
}

function defaultOf(schema: ZodTypeAny): unknown {
  let current: any = schema;
  for (let i = 0; i < 10 && current?._def; i++) {
    if (current._def.typeName === 'ZodDefault') return current._def.defaultValue();
    if (current._def.innerType) current = current._def.innerType;
    else if (current._def.schema) current = current._def.schema;
    else break;
  }
  return undefined;
}

/**
 * Math's number fields read the value as text and check it's numeric or a
 * template (preNumber in packages/schemas/src/actions/math.ts): a preprocess
 * around a refined string. They take numbers, so say so.
 */
function isNumberOrTemplate(schema: ZodTypeAny): boolean {
  let current: any = schema;
  while (current?._def && ['ZodOptional', 'ZodDefault', 'ZodNullable'].includes(current._def.typeName)) {
    current = current._def.innerType;
  }
  const def = current?._def;
  if (def?.typeName !== 'ZodEffects' || def.effect?.type !== 'preprocess') return false;
  const refined = def.schema?._def;
  return refined?.typeName === 'ZodEffects' && refined.effect?.type === 'refinement' && refined.schema?._def?.typeName === 'ZodString';
}

/** A short, readable type: number, string, "a" | "b", string[], object, steps. */
export function describeType(schema: ZodTypeAny, depth = 0): string {
  if (isNumberOrTemplate(schema)) return 'number';
  const inner: any = unwrap(schema);
  const def = inner?._def;
  if (!def || depth > 4) return 'any';
  switch (def.typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodDate':
      return 'date';
    case 'ZodLiteral':
      return JSON.stringify(def.value);
    case 'ZodEnum':
      return (def.values as string[]).map((v) => JSON.stringify(v)).join(' | ');
    case 'ZodNativeEnum':
      return Object.values(def.values).map((v) => JSON.stringify(v)).join(' | ');
    case 'ZodArray':
      return `${describeType(def.type, depth + 1)}[]`;
    case 'ZodObject':
    case 'ZodRecord':
      return 'object';
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': {
      const options: ZodTypeAny[] = Array.isArray(def.options) ? def.options : [...def.options.values()];
      // orTemplateString adds a template-only string option; every field takes templates anyway.
      const kinds = [...new Set(options.map((o) => describeType(o, depth + 1)))];
      const typed = kinds.filter((k) => k !== 'string');
      return (typed.length > 0 && kinds.length > 1 ? typed : kinds).join(' | ');
    }
    default:
      return 'any';
  }
}

function objectShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | null {
  const inner: any = unwrap(schema);
  if (inner?._def?.typeName !== 'ZodObject') return null;
  return typeof inner.shape === 'function' ? inner.shape() : inner.shape;
}

function describeBuiltIn(group: string, name: string): ActionDescription | null {
  let validation: any;
  try {
    validation = getValidation(group as any, name, 'creation');
  } catch {
    return null;
  }
  const shape = objectShape(validation.schema) ?? {};
  const fieldConfig = validation.fieldConfig ?? {};
  const fields: ActionField[] = Object.entries(shape).map(([field, schema]) => {
    const fallback = defaultOf(schema);
    // Nested steps (loops, conditions) are lists of actions, not plain arrays.
    const type = field === 'actions' ? 'steps (a list of actions run inside this one)' : describeType(schema);
    return {
      name: field,
      type,
      required: !schema.isOptional(),
      ...(fallback !== undefined ? { default: fallback } : {}),
      ...(fieldConfig[field]?.description ? { description: fieldConfig[field].description } : {}),
    };
  });
  const example = ACTION_EXAMPLES[`${group}.${name}`];
  return {
    action: `${group}.${name}`,
    label: validation.label,
    description: validation.description,
    ...(validation.returns ? { returns: validation.returns } : {}),
    fields,
    ...(example && exampleIsUsable(group, name, example) ? { example } : {}),
  };
}

/** Every step in a list, including steps nested in loops and conditions. */
function allSteps(steps: unknown): any[] {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step: any) => [step, ...allSteps(step?.params?.actions)]);
}

/**
 * Whether an example is safe to show: it parses, every step of this action in it
 * passes the action's own field check, and it uses no template the engine
 * wouldn't resolve. An example that has drifted from its schema is left out
 * rather than taught (tests/engine/actionExamples.test.ts lists which ones).
 */
export function exampleIsUsable(group: string, name: string, yaml: string): boolean {
  let steps: unknown;
  try {
    steps = Parser.importFromString(yaml);
  } catch {
    return false;
  }
  const own = allSteps(Array.isArray(steps) ? steps : [steps]).filter((s) => s?.group === group && s?.name === name);
  if (own.length === 0) return false;
  let schema: ZodTypeAny;
  try {
    schema = getValidation(group as any, name, 'creation').schema;
  } catch {
    return false;
  }
  if (!own.every((step) => schema.safeParse(step.params ?? {}).success)) return false;
  // {{ env.X }} isn't resolved by the engine; only {{ _env.X }} is.
  return !/\{[{=]\s*env\./.test(yaml);
}

function describePlugin(group: string, name: string): ActionDescription | null {
  const defs = PluginParamsRegistry[group]?.[name];
  if (!defs) return null;
  return {
    action: `${group}.${name}`,
    plugin: true,
    ...(PluginDocsRegistry[group]?.[name]?.description
      ? { description: PluginDocsRegistry[group][name].description }
      : {}),
    ...(PluginReturnsRegistry[group]?.[name] ? { returns: PluginReturnsRegistry[group][name] } : {}),
    fields: defs.map((def) => ({
      name: def.name,
      type: def.type === 'variable' ? 'a {= variable =} from an earlier step' : def.type,
      required: !!def.required,
      ...(def.default !== undefined ? { default: def.default } : {}),
      ...(def.description ? { description: def.description } : {}),
    })),
  };
}

/** Fields, return type and description of each named action ("math.multiply"). Unknown names are reported. */
export function describeActions(names: string[]): { actions: ActionDescription[]; unknown: string[] } {
  const actions: ActionDescription[] = [];
  const unknown: string[] = [];
  for (const full of names) {
    const dot = full.indexOf('.');
    const group = dot > 0 ? full.slice(0, dot) : '';
    const name = dot > 0 ? full.slice(dot + 1) : '';
    const description = (group && name && (describeBuiltIn(group, name) ?? describePlugin(group, name))) || null;
    if (description) actions.push(description);
    else unknown.push(full);
  }
  return { actions, unknown };
}

// ---------------------------------------------------------------------
// Checking a written workflow
// ---------------------------------------------------------------------

const ORDERING_RULES: Record<string, string[]> = {
  elseIfConditional: ['ifConditional', 'elseIfConditional'],
  elseConditional: ['ifConditional', 'elseIfConditional'],
  caseConditional: ['switchConditional', 'caseConditional'],
  defaultConditional: ['switchConditional', 'caseConditional'],
};

const TEMPLATE_TOKENS = /\{\{\s*([\w.]+)[^}]*\}\}|\{=\s*([\w.]+)\s*=\}/g;
// Names a template may use without a variable of that name: globals and environment.
const BUILT_IN_ROOTS = new Set(['_global', '_env', 'lastResult']);

// What scripts written for Node.js reach for that the runScript sandbox doesn't have.
const SANDBOX_MISSES: [RegExp, string][] = [
  [/\brequire\s*\(/, 'require'],
  [/^\s*import\s[\s\S]*?\bfrom\s*['"]|\bimport\s*\(/m, 'import'],
  [/\bprocess\s*\./, 'process'],
  [/\b__dirname\b|\b__filename\b/, '__dirname'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bset(?:Timeout|Interval|Immediate)\s*\(/, 'timers'],
];

/** The Node.js features a script uses that the runScript sandbox doesn't provide. */
export function sandboxMisses(code: string): string[] {
  // Text and comments may mention them freely; an import keeps its (emptied) quotes after `from`.
  const bare = code
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return SANDBOX_MISSES.filter(([pattern]) => pattern.test(bare)).map(([, name]) => name);
}

function stepLabel(action: any, path: string): string {
  const what = action?.group && action?.name ? `${action.group}.${action.name}` : 'step';
  return action?.label ? `${path} "${action.label}" (${what})` : `${path} (${what})`;
}

function collectTemplateRoots(value: unknown, roots: Set<string>) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TEMPLATE_TOKENS)) {
      const name = match[1] ?? match[2];
      if (name) roots.add(name.split('.')[0]);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectTemplateRoots(item, roots);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectTemplateRoots(item, roots);
  }
}

function checkSteps(
  actions: any[],
  path: string,
  declared: Set<string>,
  types: Map<string, string>,
  errors: string[],
  warnings: string[]
) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const at = `${path}[${index}]`;
    const label = stepLabel(action, at);
    if (!action?.group || !action?.name) return;

    const validPrev = ORDERING_RULES[action.name];
    if (action.group === 'flow' && validPrev) {
      const prev = actions[index - 1];
      if (!(prev?.group === 'flow' && validPrev.includes(prev.name))) {
        errors.push(`${label}: must come right after ${validPrev.join(' or ')}.`);
      }
    }

    const params = action.params ?? {};
    // A branch written as a key of the step before it, beside or inside its params:
    // unknown keys are dropped, so it would never run.
    if (action.group === 'flow') {
      for (const key of [...Object.keys(action), ...Object.keys(params)].filter((name) => ORDERING_RULES[name])) {
        errors.push(
          `${label}: "${key}" can't be a key of this step. Make it its own step (group flow, name ${key}) right after this one, with its steps under params.actions.`
        );
      }
    }

    let schema: ZodTypeAny | null = null;
    try {
      schema = getValidation(action.group as any, action.name, 'creation').schema;
    } catch {
      schema = PluginSchemaRegistry[action.group]?.[action.name] ?? null;
    }
    if (schema) {
      const result = schema.safeParse(params);
      if (!result.success) {
        errors.push(`${label}: ${readableValidationError(JSON.stringify(result.error.issues))}`);
      }
    }

    if (action.group === 'script' && action.name === 'runScript' && typeof params.code === 'string') {
      const used = sandboxMisses(params.code);
      if (used.length) {
        errors.push(
          `${label}: the script uses ${used.join(', ')}, which a script can't reach: it runs plain JavaScript ` +
            `in a sandbox, without Node.js modules, files, network or timers. Do that part with the file, ` +
            `folder, http or system actions and pass their results in context.`
        );
      }
    }

    // Loops name the variables they set for their body.
    const scope = new Set(declared);
    for (const key of ['currentItem', 'currentIndex', 'indexVariable', 'itemVariable']) {
      if (typeof params[key] === 'string') scope.add(params[key]);
    }

    const roots = new Set<string>();
    collectTemplateRoots({ ...params, actions: undefined, statements: undefined }, roots);
    for (const root of roots) {
      if (!scope.has(root) && !BUILT_IN_ROOTS.has(root)) {
        warnings.push(`${label}: uses "${root}", which isn't a variable of this workflow.`);
      }
    }
    if (action.group === 'variable' && action.name === 'set' && action.destination) {
      // The step writes to params.name; a destination would then overwrite something with `true`.
      errors.push(
        `${label}: variable.set already writes to "${params.name}". Leave out destination: it would be set to true.`
      );
    } else if (action.destination && typeof action.destination === 'string' && !action.destination.startsWith('_global.')) {
      // The same check a run makes (pipeline/Block.ts assertDestinationType).
      if (!scope.has(action.destination)) {
        errors.push(`${label}: writes to "${action.destination}", which isn't declared under pipeline.variables.`);
      }
      const expected = declaredReturnType(action.group, action.name);
      const found = types.get(action.destination);
      if (expected && expected !== 'any' && found && found !== expected) {
        errors.push(
          `${label}: destination "${action.destination}" must be declared with type "${expected}" (found "${found}").`
        );
      }
    }

    checkSteps(params.actions, `${at}.params.actions`, scope, types, errors, warnings);
    if (Array.isArray(params.statements)) {
      params.statements.forEach((statement: any, s: number) =>
        checkSteps(statement?.actions, `${at}.params.statements[${s}].actions`, scope, types, errors, warnings)
      );
    }
  });
}

const PLAIN_TYPES = new Set(['string', 'number', 'boolean', 'date', 'array', 'object']);
const A_TYPE: Record<string, string> = {
  string: 'text',
  number: 'a number',
  boolean: 'true or false',
  date: 'a date',
  array: 'a list',
  object: 'an object',
};
const aType = (type: string) => A_TYPE[type] ?? `a ${type}`;

/**
 * Whether a value of one variable type can be set on a variable of another, as
 * Variable.setValue converts it (coerceVariableValue): always, only for some
 * values ("maybe": text must read as a number, a list must be JSON), or never.
 * Opened and loaded types (browser, connections, images) only take their own type.
 */
function typeFit(from: string, to: string): 'ok' | 'maybe' | 'no' {
  if (from === to) return 'ok';
  if (!PLAIN_TYPES.has(from) || !PLAIN_TYPES.has(to)) return 'no';
  switch (to) {
    case 'string':
      return from === 'array' || from === 'object' ? 'no' : 'ok';
    case 'number':
      return from === 'string' || from === 'date' ? 'maybe' : 'no';
    case 'date':
      return from === 'string' || from === 'number' ? 'maybe' : 'no';
    default:
      // boolean, array, object: only from text that reads as one.
      return from === 'string' ? 'maybe' : 'no';
  }
}

const WHOLE_VALUE = /^\{=\s*(\w+)\s*=\}$/;
const WHOLE_TEXT = /^\{\{\s*(\w+)\s*\}\}$/;

/**
 * Checks one value passed between workflows against the type it lands in: a prop
 * (this workflow's value → the other one's input) or an output (back the other way).
 * A fixed value is converted the way a run would; a variable is judged by its
 * declared type. A path inside a variable ("order.id") or text mixing words and
 * variables can't be typed here, except that text never becomes a list, an object
 * or an opened type.
 */
function checkPassedType(
  value: unknown,
  to: string | undefined,
  types: Map<string, string>,
  where: string,
  errors: string[],
  warnings: string[]
) {
  if (!to || to === 'any') return;

  const fit = (from: string, name: string) => {
    const result = typeFit(from, to);
    if (result === 'no') {
      errors.push(`${where}: "${name}" holds ${aType(from)}, but it needs ${aType(to)}.`);
    } else if (result === 'maybe') {
      warnings.push(`${where}: "${name}" holds ${aType(from)}; the run stops unless it reads as ${aType(to)}.`);
    }
  };

  if (typeof value === 'string' && /\{\{|\{=/.test(value)) {
    const whole = WHOLE_VALUE.exec(value.trim());
    if (whole) {
      const from = types.get(whole[1]);
      if (from) fit(from, whole[1]);
      return;
    }
    const text = WHOLE_TEXT.exec(value.trim());
    if (text) {
      const from = types.get(text[1]);
      if (!from) return;
      if (to === 'array' || to === 'object' || !PLAIN_TYPES.has(to)) {
        errors.push(`${where}: needs ${aType(to)}; pass it as it is with '{= ${text[1]} =}', not as text.`);
      } else if (to !== 'string') {
        // '{{ }}' writes the value out as text, so a text input takes any variable.
        fit(from, text[1]);
      }
      return;
    }
    // Words mixed with variables always make text.
    if (to === 'number' || to === 'boolean' || to === 'array' || to === 'object' || !PLAIN_TYPES.has(to)) {
      errors.push(`${where}: text mixing words and variables can't become ${aType(to)}.`);
    }
    return;
  }

  if (!PLAIN_TYPES.has(to)) {
    errors.push(`${where}: needs ${aType(to)}, which only a variable can hold. Pass one with '{= name =}'.`);
    return;
  }
  try {
    coerceVariableValue(value, to as any, 'value');
  } catch {
    errors.push(`${where}: ${JSON.stringify(value)} can't be used as ${aType(to)}.`);
  }
}

/** Every subtask.exec step, at any depth, with where it sits. */
function collectSubworkflowSteps(actions: any[], path: string, found: Array<{ action: any; at: string }>) {
  if (!Array.isArray(actions)) return;
  actions.forEach((action, index) => {
    const at = `${path}[${index}]`;
    if (action?.group === 'subtask' && action?.name === 'exec') found.push({ action, at });
    collectSubworkflowSteps(action?.params?.actions, `${at}.params.actions`, found);
    if (Array.isArray(action?.params?.statements)) {
      action.params.statements.forEach((statement: any, s: number) =>
        collectSubworkflowSteps(statement?.actions, `${at}.params.statements[${s}].actions`, found)
      );
    }
  });
}

/**
 * Checks each sub-workflow step against the workflow it calls: that it's installed
 * and not a draft, that `props` set its inputs and `outputs` read variables it lets
 * a parent read. A run skips a prop or output naming no variable without a word, so
 * here that's an error: the step would quietly do nothing with it.
 */
async function checkSubworkflows(
  actions: any[],
  declared: Set<string>,
  types: Map<string, string>,
  errors: string[],
  warnings: string[]
) {
  const steps: Array<{ action: any; at: string }> = [];
  collectSubworkflowSteps(actions, 'pipeline.actions', steps);

  for (const { action, at } of steps) {
    const label = stepLabel(action, at);
    const params = action.params ?? {};
    const props: Record<string, unknown> = params.props && typeof params.props === 'object' ? params.props : {};
    const outputs: Record<string, unknown> =
      params.outputs && typeof params.outputs === 'object' ? params.outputs : {};

    if (params.async === true && Object.keys(outputs).length > 0) {
      errors.push(`${label}: "outputs" can't be used with "async": the workflow goes on before the other one finishes.`);
    }

    for (const target of Object.keys(outputs)) {
      if (!declared.has(target)) {
        errors.push(`${label}: writes to "${target}", which isn't declared under pipeline.variables.`);
      }
    }

    const identifier = params.identifier;
    // A file path or an identifier picked at run time can't be looked up here.
    if (typeof identifier !== 'string' || identifier.includes('{')) continue;

    if (parseHubWorkflowId(identifier)) {
      errors.push(
        `${label}: "${identifier}" is on a hub and not installed. Use an installed workflow, or leave this step out and add "Install it from the hub" to the to-do list.`
      );
      continue;
    }

    const record = await TaskService.getByIdentifier(identifier);
    if (!record) {
      errors.push(`${label}: there is no installed workflow "${identifier}". Use an identifier from search_workflows.`);
      continue;
    }
    if (isDraft(record)) {
      errors.push(`${label}: "${record.name}" is a draft and can't run as a sub-workflow until someone marks it ready.`);
      continue;
    }

    let source: any = {};
    try {
      source = typeof record.source === 'string' ? JSON.parse(record.source) : (record.source ?? {});
    } catch {
      // A source that doesn't parse has no variables to check against.
    }
    const variables: any[] = Array.isArray(source?.pipeline?.variables) ? source.pipeline.variables : [];
    const byName = new Map(variables.filter((v) => typeof v?.name === 'string').map((v) => [v.name, v]));
    const inputs = workflowInputs(source);
    const inputNames = inputs.map((input) => input.name).join(', ') || 'none';
    const readable = variables
      .filter((v) => v?.name && (v.visibility ?? 'private') !== 'private')
      .map((v) => v.name)
      .join(', ') || 'none';
    const what = `"${record.name}" (${identifier})`;

    for (const key of Object.keys(props)) {
      const variable = byName.get(key);
      if (!variable) {
        errors.push(`${label}: ${what} has no input "${key}". Its inputs: ${inputNames}.`);
      } else if ((variable.visibility ?? 'private') === 'private') {
        errors.push(`${label}: "${key}" is private in ${what}, so it can't be set from here. Its inputs: ${inputNames}.`);
      } else if (variable.output) {
        errors.push(`${label}: "${key}" is an output of ${what}, not an input. Read it with "outputs" instead.`);
      } else {
        checkPassedType(props[key], variable.type ?? 'string', types, `${label}: input "${key}" of ${what}`, errors, warnings);
      }
    }

    // A run doesn't stop for a missing input: the other workflow would carry on with it empty.
    for (const input of inputs) {
      if (input.required && input.default === undefined && !(input.name in props)) {
        errors.push(
          `${label}: ${what} needs the input "${input.name}" (${aType(input.type)}). Set it in props: a value, ` +
            `an input of this workflow, or an output of an earlier step.`
        );
      }
    }

    for (const [target, from] of Object.entries(outputs)) {
      if (typeof from !== 'string') continue;
      const variable = byName.get(from);
      if (!variable) {
        errors.push(`${label}: ${what} has no variable "${from}" to read into "${target}". It returns: ${readable}.`);
      } else if ((variable.visibility ?? 'private') === 'private') {
        errors.push(`${label}: "${from}" is private in ${what}, so it can't be read from here. It returns: ${readable}.`);
      } else {
        const to = types.get(target);
        const result = to ? typeFit(variable.type ?? 'string', to) : 'ok';
        if (result === 'no') {
          errors.push(
            `${label}: "${from}" of ${what} is ${aType(variable.type ?? 'string')}, but "${target}" is declared as ${aType(to!)}.`
          );
        } else if (result === 'maybe') {
          warnings.push(
            `${label}: "${from}" of ${what} is ${aType(variable.type ?? 'string')}; the run stops unless it reads as ${aType(to!)}, the type of "${target}".`
          );
        }
      }
    }
  }
}

/**
 * The format check reports translation keys ("task.validationFailed\ntask.description.required").
 * Core has no translations, so the keys are turned into sentences here.
 */
export function readableFormatErrors(message: string): string[] {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\w+\.validationFailed$/.test(line));
  if (lines.length === 0) return [message];
  return lines.map((line) => {
    const match = /^(?:task|action|variable|app)\.([\w.]+)\.(required|invalid|format|minLength|maxLength)$/.exec(line);
    if (!match) return readableValidationError(line);
    const [, field, rule] = match;
    switch (rule) {
      case 'required':
        return `"${field}" is required.`;
      case 'format':
        return `"${field}" has the wrong format.`;
      default:
        return `"${field}" has an invalid value.`;
    }
  });
}

/**
 * Checks workflow YAML the way installing and running it would — format,
 * variable declarations, known actions, every step's fields and the if/else
 * order — and reports all problems at once, so they can be fixed in one go.
 */
export async function checkWorkflowYaml(yaml: string): Promise<WorkflowCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let raw: any;
  try {
    raw = Parser.importFromString(yaml);
  } catch (error: any) {
    return { valid: false, errors: [error.message ?? String(error)], warnings };
  }
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['The YAML is not a workflow (expected a mapping with name and pipeline).'], warnings };
  }

  try {
    TaskValidator.validateFormat(raw);
  } catch (error: any) {
    errors.push(...readableFormatErrors(error.message ?? String(error)));
  }

  const actions = raw?.pipeline?.actions ?? [];
  try {
    errors.push(...(await TaskValidator.validateActionTypes(actions)));
  } catch (error: any) {
    errors.push(error.message ?? String(error));
  }

  const variables: any[] = Array.isArray(raw?.pipeline?.variables) ? raw.pipeline.variables : [];
  const declared = new Set<string>(
    variables.map((v) => v?.name).filter((name: unknown): name is string => typeof name === 'string')
  );
  const types = new Map<string, string>(
    variables
      .filter((v) => typeof v?.name === 'string' && typeof v?.type === 'string')
      .map((v) => [v.name, v.type])
  );
  checkSteps(actions, 'pipeline.actions', declared, types, errors, warnings);
  try {
    await checkSubworkflows(actions, declared, types, errors, warnings);
  } catch (error: any) {
    errors.push(error.message ?? String(error));
  }

  // Not an error: a draft may ask for a global someone creates afterwards.
  const used = [...globalsRead(actions)];
  if (used.length) {
    const known = new Set((await GlobalVariableService.getAll()).map((record: any) => record.name));
    for (const name of used.filter((global) => !known.has(global))) {
      warnings.push(`Global variable "${name}" doesn't exist yet. The run fails until it's created on the Variables page.`);
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/**
 * The same workflow YAML with its author replaced. A draft belongs to the person
 * who asked for it, so Core sets the author rather than trusting the model.
 * Re-serialising drops comments, which drafts don't rely on.
 */
export function setWorkflowAuthor(yaml: string, author: string): string {
  const raw = Parser.importFromString(yaml) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || !author) return yaml;
  return Parser.exportToString({ ...raw, author });
}

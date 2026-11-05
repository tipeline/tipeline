import { getValidation } from '@tipeline/schemas';
import { CONDITION_OPERATOR_LABELS } from '@tipeline/utils';
import { TEMPLATE_TOKEN_RE } from '@/utils/templateReferences';

// The line under a step's name on the workflow canvas: the one setting that
// tells two steps of the same type apart (which sub-workflow, which file,
// which URL).

export type SummaryPartKind = 'text' | 'var' | 'name';

export interface SummaryPart {
  text: string;
  kind: SummaryPartKind;
}

export type SummaryWord = 'each' | 'in' | 'inBackground' | 'lines' | 'files';

export interface SummaryContext {
  /** Name of an installed workflow, for sub-workflow steps. */
  workflowName?: (identifier: string) => string | undefined;
  /** Connecting words, so the line can be translated. */
  word?: (key: SummaryWord, count?: number) => string;
}

const ENGLISH_WORDS: Record<SummaryWord, (count?: number) => string> = {
  each: () => 'each',
  in: () => 'in',
  inBackground: () => 'in background',
  lines: (n) => (n === 1 ? '1 line' : `${n} lines`),
  files: (n) => (n === 1 ? '1 file' : `${n} files`),
};

// Long values (scripts, prompts, HTML) are cut here; the row's CSS ellipsis
// handles the rest.
const MAX_VALUE_LENGTH = 120;

// Never worth a place on the line: connections and browsers (always the same
// handful of variables), secrets, and option bags.
const SKIPPED_FIELDS = new Set([
  'browser',
  'connection',
  'config',
  'configuration',
  'apiKey',
  'password',
  'pass',
  'clientSecret',
  'token',
  'options',
  'selectorType',
  'headers',
  'parameters',
  'waitUntil',
  'timeout',
  'compareAs',
]);

const SKIPPED_COMPONENTS = new Set(['browser-select']);

const text = (value: string): SummaryPart => ({ text: value, kind: 'text' });
const variable = (value: string): SummaryPart => ({ text: value, kind: 'var' });
const SEPARATOR = text(' · ');

/** A stored value as line parts: `{{ x }}` / `{= x =}` become variables, the rest plain text. */
export function valueParts(value: unknown): SummaryPart[] {
  if (typeof value === 'number' || typeof value === 'boolean') return [text(String(value))];
  if (typeof value !== 'string') return [];
  let line = value.trim().split('\n')[0].replace(/\s+/g, ' ');
  if (!line) return [];
  if (line.length > MAX_VALUE_LENGTH) line = line.slice(0, MAX_VALUE_LENGTH) + '…';

  const parts: SummaryPart[] = [];
  let last = 0;
  for (const m of line.matchAll(TEMPLATE_TOKEN_RE)) {
    const from = m.index ?? 0;
    if (from > last) parts.push(text(line.slice(last, from)));
    parts.push(variable(m[1] ?? m[2] ?? ''));
    last = from + m[0].length;
  }
  if (last < line.length) parts.push(text(line.slice(last)));
  return parts;
}

function joinParts(...groups: SummaryPart[][]): SummaryPart[] {
  const filled = groups.filter((g) => g.length > 0);
  return filled.flatMap((g, i) => (i === 0 ? g : [SEPARATOR, ...g]));
}

function lastPathParts(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 2 ? '…/' + segments.slice(-2).join('/') : path;
}

// A path built from variables stays whole; only a literal path is shortened.
function pathParts(value: unknown): SummaryPart[] {
  if (typeof value === 'string' && !/\{\{|\{=/.test(value)) return valueParts(lastPathParts(value));
  return valueParts(value);
}

function fromTo(from: SummaryPart[], to: SummaryPart[]): SummaryPart[] {
  if (from.length === 0) return to;
  if (to.length === 0) return from;
  return [...from, text(' → '), ...to];
}

function fieldConfigOf(action: any): Record<string, any> | undefined {
  if (action?.source === 'plugin') return undefined;
  try {
    return getValidation(action.group, action.name, 'creation')?.fieldConfig;
  } catch {
    return undefined;
  }
}

// Field names in the order the schema declares them — the order the edit form
// shows — so "first filled field" means the same thing the user sees first.
function schemaFieldOrder(action: any): string[] {
  if (action?.source === 'plugin') return [];
  try {
    let schema: any = getValidation(action.group, action.name, 'creation')?.schema;
    for (let i = 0; i < 5 && schema && !schema.shape; i++) {
      schema = schema._def?.schema ?? schema._def?.innerType;
    }
    const shape = typeof schema?.shape === 'function' ? schema.shape() : schema?.shape;
    return shape ? Object.keys(shape) : [];
  } catch {
    return [];
  }
}

/** The first one or two filled fields, for every action without its own rule. */
function genericParts(action: any): SummaryPart[] {
  const params = action?.params ?? {};
  const fieldConfig = fieldConfigOf(action) ?? {};
  const order = schemaFieldOrder(action);
  const keys = [...order, ...Object.keys(params).filter((k) => !order.includes(k))];
  const picked: SummaryPart[][] = [];
  for (const key of keys) {
    if (SKIPPED_FIELDS.has(key) || SKIPPED_COMPONENTS.has(fieldConfig[key]?.component)) continue;
    // On/off switches say little next to the step's name.
    if (typeof params[key] === 'boolean') continue;
    const parts = fieldConfig[key]?.component === 'path-select' ? pathParts(params[key]) : valueParts(params[key]);
    if (parts.length === 0) continue;
    picked.push(parts);
    if (picked.length === 2) break;
  }
  return joinParts(...picked);
}

function conditionParts(params: any): SummaryPart[] {
  const operator = params?.operator as keyof typeof CONDITION_OPERATOR_LABELS | undefined;
  const label = operator ? (CONDITION_OPERATOR_LABELS[operator] ?? operator).toLowerCase() : '';
  const first = valueParts(params?.firstOperand);
  const second = valueParts(params?.secondOperand);
  if (first.length === 0) return [];
  return [...first, ...(label ? [text(` ${label} `)] : []), ...second];
}

type Rule = (action: any, ctx: Required<SummaryContext>) => SummaryPart[];

const RULES: Record<string, Rule> = {
  'subtask.exec': ({ params }, ctx) => {
    let name: string | undefined;
    if (params?.identifier) name = ctx.workflowName(params.identifier) ?? params.identifier;
    else if (typeof params?.path === 'string' && params.path) name = lastPathParts(params.path);
    if (!name) return [];
    const parts: SummaryPart[] = [{ text: name, kind: 'name' }];
    if (params?.async) parts.push(SEPARATOR, text(ctx.word('inBackground')));
    return parts;
  },
  'flow.ifConditional': ({ params }) => conditionParts(params),
  'flow.elseIfConditional': ({ params }) => conditionParts(params),
  'flow.conditionalLoop': ({ params }) => conditionParts(params),
  'flow.forEachLoop': ({ params }, ctx) => {
    const list = valueParts(params?.iterable);
    if (list.length === 0) return [];
    const item = typeof params?.currentItem === 'string' && params.currentItem ? [variable(params.currentItem), text(' ')] : [];
    return [text(`${ctx.word('each')} `), ...item, text(`${ctx.word('in')} `), ...list];
  },
  'flow.simpleLoop': ({ params }) => fromTo(valueParts(params?.indexValue), valueParts(params?.indexEndValue)),
  'flow.wait': ({ params }) => (params?.timeout != null && params.timeout !== '' ? [text(`${params.timeout} ms`)] : []),
  'api.request': ({ params }) => [
    ...(params?.method ? [text(`${String(params.method).toUpperCase()} `)] : []),
    ...valueParts(params?.url),
  ],
  'http.request': ({ params }) => {
    const url = valueParts(params?.url);
    if (url.length === 0) return [];
    return [text(`${String(params?.method || 'get').toUpperCase()} `), ...url];
  },
  'email.send': ({ params }, ctx) => {
    const attachments = Array.isArray(params?.attachments) ? params.attachments.length : 0;
    return joinParts(
      valueParts(params?.to),
      valueParts(params?.subject),
      attachments > 0 ? [text(ctx.word('files', attachments))] : []
    );
  },
  'variable.set': ({ params }) => {
    if (typeof params?.name !== 'string' || !params.name) return [];
    const value = valueParts(params?.value);
    return [variable(params.name), ...(value.length ? [text(' = '), ...value] : [])];
  },
  'script.runScript': ({ params }, ctx) => {
    if (typeof params?.code !== 'string' || !params.code.trim()) return [];
    return [text(ctx.word('lines', params.code.trim().split('\n').length))];
  },
  'file.copy': ({ params }) => fromTo(pathParts(params?.src), pathParts(params?.dest)),
  'file.move': ({ params }) => fromTo(pathParts(params?.src), pathParts(params?.dest)),
  'file.rename': ({ params }) => fromTo(pathParts(params?.oldPath), pathParts(params?.newPath)),
  'folder.copy': ({ params }) => fromTo(pathParts(params?.src), pathParts(params?.dest)),
  'folder.move': ({ params }) => fromTo(pathParts(params?.src), pathParts(params?.dest)),
  'folder.rename': ({ params }) => fromTo(pathParts(params?.oldPath), pathParts(params?.newPath)),
};

export function summarizeAction(action: any, ctx: SummaryContext = {}): SummaryPart[] {
  const full: Required<SummaryContext> = {
    workflowName: ctx.workflowName ?? (() => undefined),
    word: ctx.word ?? ((key, count) => ENGLISH_WORDS[key](count)),
  };
  const rule = RULES[`${action?.group}.${action?.name}`];
  return rule ? rule(action, full) : genericParts(action);
}

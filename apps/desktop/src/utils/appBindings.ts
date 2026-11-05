import { Liquid } from 'liquidjs';

// App bindings use the same two syntaxes as workflow params (core's parseParams):
//   {{ expr }}  — LiquidJS; always renders to a string (filters, {% if %}, …)
//   {= path =}  — raw reference; keeps the value's type; must be the entire value
// Evaluated against the app runtime context (state, runnables, page, component ids,
// and `result` / `error` inside onSuccess / onError). Reading reactive objects here
// inside a computed makes Vue re-evaluate the binding when they change.

const liquid = new Liquid({ strictVariables: false });

// Same lockdown as core: no file-system / layout tags.
for (const tag of ['layout', 'include', 'render', 'extends', 'block']) {
  liquid.registerTag(tag, {
    parse() {},
    render() {
      throw new Error(
        `The '${tag}' tag is not supported in Tipeline templates.`
      );
    },
  });
}

const RAW = /^\{=\s*([\w.[\]]+)\s*=\}$/;

/** Resolves `root.a.b[0].c` against the context. */
function resolvePath(context: Record<string, unknown>, ref: string): unknown {
  const rootEnd = ref.search(/[.[]/);
  const root = rootEnd === -1 ? ref : ref.slice(0, rootEnd);
  let value: any = context[root];
  const segments = /\.([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  segments.lastIndex = root.length;
  while ((m = segments.exec(ref)) !== null) {
    if (value == null) return undefined;
    value = m[1] !== undefined ? value[m[1]] : value[Number(m[2])];
  }
  return value;
}

// Every dotted path mentioned in a template (`recordsTable.selectedRow.name`, `state.x`,
// `r.amount`…). Over-matching is harmless: unknown names just resolve to undefined.
const TEMPLATE_PATH = /[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*|\[\d+\])*/g;

/**
 * Reads every path a template mentions, before LiquidJS renders it.
 *
 * LiquidJS (ownPropertyOnly, kept on for parity with workflows) checks
 * `hasOwnProperty` before reading a property, and Vue's reactivity does not track
 * that check. So a template rendered while a value is still missing — e.g.
 * `{{ recordsTable.selectedRow.name }}` before any row is clicked — would never read
 * `selectedRow`, never depend on it, and never re-render once it is set. Reading the
 * paths here (ordinary property gets, which Vue does track) registers those
 * dependencies.
 */
function trackTemplatePaths(
  template: string,
  context: Record<string, unknown>
) {
  for (const match of template.matchAll(TEMPLATE_PATH))
    resolvePath(context, match[0]);
}

export function isBinding(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (RAW.test(value) || value.includes('{{') || value.includes('{%'))
  );
}

/**
 * Resolves one value. Strings with bindings are evaluated; objects and arrays are
 * resolved recursively; anything else is returned as-is. A binding that fails to
 * evaluate resolves to `undefined` (raw) or '' (template) rather than throwing, so
 * one bad expression can't take the whole page down.
 */
export function resolveBinding(
  value: unknown,
  context: Record<string, unknown>
): unknown {
  if (typeof value === 'string') {
    const raw = value.match(RAW);
    if (raw) return resolvePath(context, raw[1]);
    if (!value.includes('{{') && !value.includes('{%')) return value;
    trackTemplatePaths(value, context);
    try {
      return liquid.parseAndRenderSync(value, context);
    } catch (error) {
      console.warn('[app] binding failed:', value, error);
      return '';
    }
  }
  if (Array.isArray(value))
    return value.map((item) => resolveBinding(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveBinding(item, context),
      ])
    );
  }
  return value;
}

// Rewrites references inside binding expressions — `{{ … }}`, `{% … %}` and `{= … =}` —
// and leaves every other text alone, so renaming a component called "status" never
// touches a label that merely says "status".

const BINDING_SEGMENT = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{=[\s\S]*?=\}/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Applies `rewrite` to every binding segment of every string inside `value`. */
export function rewriteBindings<T>(
  value: T,
  rewrite: (segment: string) => string
): T {
  if (typeof value === 'string') {
    return (
      value.includes('{') ? value.replace(BINDING_SEGMENT, rewrite) : value
    ) as T;
  }
  if (Array.isArray(value))
    return value.map((item) => rewriteBindings(item, rewrite)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteBindings(item, rewrite),
      ])
    ) as T;
  }
  return value;
}

const STRING_LITERAL = `'[^']*'|"[^"]*"`;

/** Replaces `pattern` matches in a segment, skipping quoted string literals. */
function replaceOutsideStrings(
  segment: string,
  pattern: string,
  replacement: string
): string {
  return segment.replace(
    new RegExp(`(${STRING_LITERAL})|${pattern}`, 'g'),
    (match, quoted) => quoted ?? replacement
  );
}

/** `oldId.x` → `newId.x` — only as a root reference, never after a dot (`state.oldId`). */
export function renameComponentReferences<T>(
  value: T,
  oldId: string,
  newId: string
): T {
  const pattern = `(?<![\\w.])${escape(oldId)}(?!\\w)`;
  return rewriteBindings(value, (segment) =>
    replaceOutsideStrings(segment, pattern, newId)
  );
}

/** `runnables.oldName` → `runnables.newName`. */
export function renameRunnableReferences<T>(
  value: T,
  oldName: string,
  newName: string
): T {
  const pattern = `(?<![\\w.])runnables\\.${escape(oldName)}(?!\\w)`;
  return rewriteBindings(value, (segment) =>
    replaceOutsideStrings(segment, pattern, `runnables.${newName}`)
  );
}

// Liquid tag names, operators and literals — never references.
const LIQUID_WORDS = new Set([
  'if',
  'elsif',
  'else',
  'endif',
  'unless',
  'endunless',
  'case',
  'when',
  'endcase',
  'for',
  'in',
  'endfor',
  'break',
  'continue',
  'assign',
  'capture',
  'endcapture',
  'cycle',
  'tablerow',
  'endtablerow',
  'raw',
  'endraw',
  'comment',
  'endcomment',
  'and',
  'or',
  'not',
  'contains',
  'true',
  'false',
  'nil',
  'null',
  'empty',
  'blank',
  'limit',
  'offset',
  'reversed',
  'with',
  'as',
]);

/** Every string inside `value`, however deeply nested. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value))
    value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

/** Where each binding segment (`{{ … }}`, `{% … %}`, `{= … =}`) sits in `text`. */
export function bindingSegmentRanges(text: string): { from: number; to: number }[] {
  return [...text.matchAll(BINDING_SEGMENT)].map((m) => ({
    from: m.index ?? 0,
    to: (m.index ?? 0) + m[0].length,
  }));
}

const blank = (s: string) => ' '.repeat(s.length);

/**
 * Every dotted path referenced by the bindings in `text`, with where it sits — string
 * literals, filter names (`| default:`), Liquid keywords and loop variables (declared
 * anywhere in the same string) are left out.
 */
export function bindingReferenceTokens(
  text: string
): { from: number; to: number; path: string }[] {
  // Same-length blanking keeps every offset in a body equal to its offset in `text`.
  const segments = [...text.matchAll(BINDING_SEGMENT)].map((m) => ({
    at: m.index ?? 0,
    body: (blank(m[0].slice(0, 2)) + m[0].slice(2, -2) + blank(m[0].slice(-2)))
      .replace(new RegExp(STRING_LITERAL, 'g'), blank)
      .replace(/\|\s*\w+/g, blank),
  }));
  const loopVars = new Set(
    segments.flatMap(({ body }) =>
      [...body.matchAll(/\bfor\s+(\w+)\s+in\b/g)].map((m) => m[1])
    )
  );
  const tokens: { from: number; to: number; path: string }[] = [];
  for (const { at, body } of segments) {
    for (const m of body.matchAll(
      /(?<![\w.])[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*|\[\d+\])*/g
    )) {
      const root = m[0].split(/[.[]/)[0];
      if (LIQUID_WORDS.has(root) || loopVars.has(root)) continue;
      const from = at + (m.index ?? 0);
      tokens.push({ from, to: from + m[0].length, path: m[0] });
    }
  }
  return tokens;
}

/** Every dotted path referenced by the bindings inside `value` (see bindingReferenceTokens). */
export function bindingReferences(value: unknown): string[] {
  const found = new Set<string>();
  for (const text of collectStrings(value, []))
    for (const token of bindingReferenceTokens(text)) found.add(token.path);
  return [...found];
}

// Paths left unfinished inside a binding: `{{ node.attributes. }}`, `{= rows[] =}`.
// Neither LiquidJS nor core's `{= =}` lookup fails on them — both drop the trailing `.`
// or empty `[]` and use the path before it, so the step quietly gets the whole object
// instead of the field that was meant. Shared by core (which fails the step) and the
// Desktop editors (which mark it), so the two always agree.

const BINDING_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{=[\s\S]*?=\}/g;
const STRING_RE = /"[^"]*"|'[^']*'/g;
// A path that stops at a dot (`a.b.`, `a. | upcase`) or holds an empty `[]`. A dot
// before `[` (`a.b.[0]`) works in Liquid, and `..` is a range (`(1..n)`) or a parse error.
const UNFINISHED_RE =
  /(?<![\w.\]-])[A-Za-z_][\w-]*(?:\.[\w-]+|\[[^\]]*\])*(?:\.(?![\w[.])|\[\s*\])/;

export interface UnfinishedPath {
  /** The path as typed, e.g. `node.attributes.`. */
  path: string;
  /** Where it is in the text (plain-string offsets). */
  from: number;
  to: number;
  /** The whole binding it sits in, e.g. `{{ node.attributes. }}`. */
  binding: string;
}

/** The first unfinished path inside a `{{ }}`, `{% %}` or `{= =}` in `text`, or null. */
export function findUnfinishedPath(text: string): UnfinishedPath | null {
  if (!text.includes('{')) return null;
  for (const binding of text.matchAll(BINDING_RE)) {
    // Quoted text is never a path: blank it out, keeping the offsets.
    const body = binding[0].replace(STRING_RE, (q) => ' '.repeat(q.length));
    const m = body.match(UNFINISHED_RE);
    if (!m) continue;
    const from = binding.index! + m.index!;
    return { path: m[0], from, to: from + m[0].length, binding: binding[0] };
  }
  return null;
}

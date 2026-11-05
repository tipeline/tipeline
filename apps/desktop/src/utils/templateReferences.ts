// Shared between TemplateField.vue (contenteditable fields) and the
// CodeMirror unknown-variable extension — both need to find `{{ name }}` /
// `{= name =}` tokens and decide whether `name` is a real task variable, and
// they need to agree on what counts as a match so a reference doesn't read
// as valid in one editor and invalid in the other.
// Both forms allow array-index brackets (`newDoc.replies[0].id`) since
// that's valid in real task data — LiquidJS resolves bracket access in
// `{{ }}` the same way parseParams.ts's own regex does for `{= =}`. This
// still won't match a `{{ }}` expression using Liquid filters or logic
// (`{{ name | upcase }}`) — that needs an actual Liquid parser, not a regex,
// so a reference hidden behind a filter stays invisible to this scan.
export const TEMPLATE_TOKEN_RE = /\{\{\s*([a-zA-Z_][\w.[\]]*)\s*\}\}|\{=\s*([a-zA-Z_][\w.[\]]*)\s*=\}/g

export function baseVariableName(path: string): string {
  const idx = path.search(/[.[]/)
  return idx === -1 ? path : path.slice(0, idx)
}

// `_env.*` / `_global.*` are resolved by core from a different source
// (process.env / global variables — see parseParams.ts), and `_previous` is
// the previous action's raw result in the same block — none of the three
// come from the task's own variable list, so they're never "unknown" even
// though they won't appear in `knownNames`. All three are leading-underscore
// names specifically because real variable names can't start with `_` (see
// variableNameSchema in packages/schemas/src/Var.ts) — so none of them can
// ever collide with (and silently shadow) a user-defined variable.
export function isKnownVariableName(name: string, knownNames: Set<string> | null): boolean {
  if (!knownNames) return true
  if (name === '_env' || name === '_global' || name === '_previous') return true
  return knownNames.has(name)
}

export interface TemplateTokenMatch {
  from: number
  to: number
  match: string
  name: string
}

export function findTemplateTokens(text: string): TemplateTokenMatch[] {
  const matches: TemplateTokenMatch[] = []
  for (const m of text.matchAll(TEMPLATE_TOKEN_RE)) {
    const path = m[1] ?? m[2] ?? ''
    const from = m.index ?? 0
    matches.push({ from, to: from + m[0].length, match: m[0], name: baseVariableName(path) })
  }
  return matches
}

// `{% for group in category.groups %}` (and `{% assign x = ... %}`) bind a
// name that's local to the template text itself — LiquidJS resolves it
// entirely within the loop/assignment, with no connection to the task's own
// variables. Without this, `{{ group.label }}` inside that loop reads as an
// unknown reference even though it's correct Liquid.
//
// This isn't scope-accurate — a name from `{% for %}` is treated as known
// for the whole template, not just inside its `{% endfor %}` — because
// tracking exact block boundaries needs a real parser. Being slightly too
// permissive here is the safer failure mode: it can only hide a genuine typo
// that happens to reuse a loop variable's name outside its loop, whereas
// being too strict would flag correct, working templates as broken.
const FOR_TAG_RE = /\{%-?\s*for\s+(\w+)\s+in\s+/g
const ASSIGN_TAG_RE = /\{%-?\s*assign\s+(\w+)\s*=/g

export function localTemplateBindings(text: string): Set<string> {
  const names = new Set<string>()
  for (const m of text.matchAll(FOR_TAG_RE)) {
    names.add(m[1])
    names.add('forloop')
  }
  for (const m of text.matchAll(ASSIGN_TAG_RE)) {
    names.add(m[1])
  }
  return names
}

// Several `{% %}` tags read a task variable without ever wrapping it in
// `{{ }}`, so TEMPLATE_TOKEN_RE alone misses them — the loop source in
// `{% for product in collection %}` (distinct from the locally-bound `product`,
// see FOR_TAG_RE/localTemplateBindings above), the condition in
// `{% if/elsif/unless EXPR %}`, the subject in `{% case EXPR %}`, the value in
// `{% when EXPR %}` (usually a literal, but Liquid allows a variable there),
// and the right-hand side of `{% assign x = EXPR %}` (the bound name `x` is
// the local half, handled separately by ASSIGN_TAG_RE). Without this, a
// variable read only inside one of these tags never shows up as "used" in
// the task variables panel.
//
// This captures the raw tag text up to its closing `%}`, then pulls every
// identifier-shaped token out of it — a condition like `if a and b == "x"`
// can reference more than one variable, unlike a `for`/`case`/`assign`
// source, which regexes alone can't tell apart from a single-identifier tag.
// Being too permissive (crediting a Liquid filter name like `plus` in
// `{% assign x = a | plus: b %}` as if it were a variable) is the safer
// failure mode: it only adds a harmless, never-looked-up key to the usage
// index, whereas missing a real reference would wrongly flag a used variable
// as unused.
const TAG_EXPRESSION_RE =
  /\{%-?\s*(?:for\s+\w+\s+in|if|elsif|unless|case|when|assign\s+\w+\s*=)\s+([\s\S]*?)-?%\}/g

// Boolean/comparison keywords and literals that can appear inside a Liquid
// expression but are never variable references.
const EXPRESSION_KEYWORDS = new Set([
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
])

// Identifier-shaped tokens within a tag's expression, or a quoted string
// literal — captured so it can be skipped rather than mistaken for one (e.g.
// the literal `"and"` inside quotes shouldn't be filtered as the keyword).
const EXPRESSION_TOKEN_RE = /'[^']*'|"[^"]*"|[a-zA-Z_][\w.[\]]*/g

export function templateTagSourceNames(text: string): Set<string> {
  const names = new Set<string>()
  for (const tagMatch of text.matchAll(TAG_EXPRESSION_RE)) {
    for (const tokenMatch of tagMatch[1].matchAll(EXPRESSION_TOKEN_RE)) {
      const token = tokenMatch[0]
      if (token[0] === '"' || token[0] === "'") continue
      if (EXPRESSION_KEYWORDS.has(token)) continue
      names.add(baseVariableName(token))
    }
  }
  return names
}

// A stricter sibling of templateTagSourceNames, for the two places that draw
// a red underline under an unknown name (TemplateField.vue and the CodeMirror
// extension) rather than just recording usage. Flagging a false positive
// there is loud and visible, unlike a spurious usage-index entry no one
// looks up — so this only extracts the unambiguous single-identifier form
// (`for x in SOURCE`, `case SUBJECT`), where nothing else in the tag could be
// mistaken for the name. `if`/`elsif`/`unless`/`when`/`assign` expressions
// are deliberately left out: they can hold filters and multi-variable
// conditions (`{% assign x = a | plus: b %}`), and reusing the permissive
// token scan above would underline a filter name like `plus` as if it were
// an unknown variable.
const FOR_SOURCE_TOKEN_RE = /\{%-?\s*for\s+\w+\s+in\s+([a-zA-Z_][\w.[\]]*)/g
const CASE_SUBJECT_TOKEN_RE = /\{%-?\s*case\s+([a-zA-Z_][\w.[\]]*)/g

function tokenFromTailCapture(m: RegExpMatchArray): TemplateTokenMatch {
  const path = m[1]
  const from = (m.index ?? 0) + (m[0].length - path.length)
  return { from, to: from + path.length, match: path, name: baseVariableName(path) }
}

export function findTagSourceTokens(text: string): TemplateTokenMatch[] {
  const matches: TemplateTokenMatch[] = []
  for (const m of text.matchAll(FOR_SOURCE_TOKEN_RE)) matches.push(tokenFromTailCapture(m))
  for (const m of text.matchAll(CASE_SUBJECT_TOKEN_RE)) matches.push(tokenFromTailCapture(m))
  return matches
}

// The merged view used to draw underlines: every `{{ }}`/`{= =}` token plus
// every `for`/`case` tag source, in document order.
export function findVariableReferenceTokens(text: string): TemplateTokenMatch[] {
  return [...findTemplateTokens(text), ...findTagSourceTokens(text)].sort((a, b) => a.from - b.from)
}

// A field that holds a value rather than text (a script's context entry, a sub-workflow
// prop, `variable.set`'s value…): core turns `{{ x }}` into text but hands `{= x =}` over
// as-is (parseParams.ts), so a whole-value `{{ items }}` gives the action the list's text
// instead of the list. Text and date variables come out the same either way, and a
// dotted path's type isn't known here, so only a whole reference to a variable whose
// type is something else counts.
const WHOLE_TEXT_REFERENCE_RE = /^\s*\{\{\s*([a-zA-Z_][\w.[\]]*)\s*\}\}\s*$/
const TEXT_LIKE_TYPES = new Set(['string', 'date'])

export interface TextWrappedReference {
  /** The variable path inside `{{ }}`. */
  path: string
  type: string
  from: number
  to: number
}

export function textWrappedValueReference(
  text: string,
  variables: { name: string; type: string }[]
): TextWrappedReference | null {
  const m = text.match(WHOLE_TEXT_REFERENCE_RE)
  if (!m) return null
  const variable = variables.find((v) => v.name === m[1])
  if (!variable || TEXT_LIKE_TYPES.has(variable.type)) return null
  const from = text.indexOf('{{')
  return { path: m[1], type: variable.type, from, to: text.lastIndexOf('}}') + 2 }
}

/** `text` when it's one whole `{{ path }}` and nothing else: the path, else null. */
export function wholeTextReferencePath(text: string): string | null {
  return text.match(WHOLE_TEXT_REFERENCE_RE)?.[1] ?? null
}

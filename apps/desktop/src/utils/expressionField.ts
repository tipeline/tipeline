// The plain-text model behind ExpressionInput.vue — the `{{ }}` / `{= =}` field shared by
// the workflow action editor and the app builder. The field is a contenteditable whose
// DOM is only ever text nodes plus the colored token spans `decorateExpression` renders
// (Enter inserts a literal "\n", paste goes in line by line), so a caret maps to a plain
// string offset by counting characters. `<br>` / `<div>` are still read for safety.

export interface ExpressionSuggestion {
  path: string;
  /** Short hint shown next to the path (what it is). */
  detail?: string;
}

export interface ExpressionIssue {
  severity: 'error' | 'warning';
  message: string;
}

/** A reference inside the text: `from`/`to` are plain-string offsets. */
export interface ExpressionReference {
  from: number;
  to: number;
  /** null / undefined when the reference resolves. */
  issue?: ExpressionIssue | null;
}

/** Finds the references in a field's text and says which ones don't resolve. */
export type ExpressionAnalyzer = (text: string) => ExpressionReference[];

/**
 * The binding being typed just before the caret, if any: the opener (`{{` or `{=`)
 * and the partial path typed after it — e.g. "Total {{ runnables.re" → { opener: '{{',
 * query: 'runnables.re', start: <index after the opener and spaces> }.
 */
export function bindingQueryAt(
  text: string,
  caret: number
): { opener: '{{' | '{='; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(\{\{|\{=)(\s*)([\w.[\]]*)$/);
  if (!m) return null;
  const openerIndex = before.length - m[0].length;
  // Already closed between the opener and the caret? Then we're not inside it.
  const sinceOpener = before.slice(openerIndex);
  if (/\}\}|=\}/.test(sinceOpener)) return null;
  return {
    opener: m[1] as '{{' | '{=',
    query: m[3],
    start: openerIndex + m[1].length,
  };
}

/**
 * Inserts `path` for the query at the caret: `{{ path }}` / `{= path =}`, adding the
 * closer only when it isn't already there. Returns the new text and caret position.
 */
export function insertBinding(
  text: string,
  caret: number,
  path: string
): { text: string; caret: number } {
  const q = bindingQueryAt(text, caret);
  if (!q) return { text, caret };
  const closer = q.opener === '{{' ? '}}' : '=}';
  const after = text.slice(caret);
  const hasCloser = new RegExp(
    `^[\\w.[\\]]*\\s*${closer.replace(/[{}=]/g, '\\$&')}`
  ).test(after);
  const rest = hasCloser
    ? after.replace(/^[\w.[\]]*/, '')
    : ` ${closer}${after}`;
  const head = `${text.slice(0, q.start)} ${path}`;
  const next = `${head}${hasCloser && !/^\s/.test(rest) ? ' ' : ''}${rest}`;
  return { text: next, caret: head.length };
}

/** Suggestions for the query at the caret: prefix matches first, then substring matches. */
export function matchSuggestions(
  suggestions: ExpressionSuggestion[],
  query: string,
  limit = 8
): ExpressionSuggestion[] {
  const q = query.toLowerCase();
  const starts = suggestions.filter((s) => s.path.toLowerCase().startsWith(q));
  const contains = suggestions.filter(
    (s) => !s.path.toLowerCase().startsWith(q) && s.path.toLowerCase().includes(q)
  );
  return [...starts, ...contains].slice(0, limit);
}

const KNOWN_CLASS = 'font-semibold text-primary';
const ISSUE_CLASS: Record<ExpressionIssue['severity'], string> = {
  error:
    'font-semibold text-destructive underline decoration-wavy decoration-2 underline-offset-2',
  warning:
    'font-semibold text-amber-600 dark:text-amber-400 underline decoration-wavy decoration-2 underline-offset-2',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const rank = (r: ExpressionReference) =>
  r.issue ? (r.issue.severity === 'error' ? 2 : 1) : 0;

/** One styled stretch of a field's text. */
export interface ExpressionMark {
  from: number;
  to: number;
  className: string;
  /** The issue's message, shown as a tooltip. */
  title?: string;
}

/**
 * How a field's text is styled: every reference colored — red for an error, amber for a
 * warning, with the message as its tooltip. References may overlap (a whole `{{ … }}`
 * plus one bad path inside it); where they do, the worst one wins. Adjacent stretches
 * that look the same are merged. Shared by the contenteditable field and CodeMirror.
 */
export function expressionMarks(text: string, analyze?: ExpressionAnalyzer): ExpressionMark[] {
  const refs = (analyze ? analyze(text) : []).filter(
    (r) => r.from >= 0 && r.to <= text.length && r.from < r.to
  );
  const points = [...new Set([0, text.length, ...refs.flatMap((r) => [r.from, r.to])])].sort(
    (a, b) => a - b
  );
  const marks: ExpressionMark[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [from, to] = [points[i], points[i + 1]];
    const worst = refs
      .filter((r) => r.from <= from && r.to >= to)
      .reduce<ExpressionReference | null>((w, r) => (!w || rank(r) > rank(w) ? r : w), null);
    if (!worst) continue;
    const className = worst.issue ? ISSUE_CLASS[worst.issue.severity] : KNOWN_CLASS;
    const title = worst.issue?.message;
    const last = marks[marks.length - 1];
    if (last && last.to === from && last.className === className && last.title === title)
      last.to = to;
    else marks.push({ from, to, className, title });
  }
  return marks;
}

/**
 * The contenteditable field's HTML: `text` with `expressionMarks` as spans. Only
 * display: reading the field back (`readText`) yields exactly `text`.
 */
export function decorateExpression(text: string, analyze?: ExpressionAnalyzer): string {
  let out = '';
  let cursor = 0;
  for (const mark of expressionMarks(text, analyze)) {
    out += escapeHtml(text.slice(cursor, mark.from));
    const title = mark.title ? ` title="${escapeHtml(mark.title)}"` : '';
    out += `<span class="${mark.className}"${title}>${escapeHtml(text.slice(mark.from, mark.to))}</span>`;
    cursor = mark.to;
  }
  return out + escapeHtml(text.slice(cursor));
}

const isBlock = (el: Element) => el.tagName === 'DIV' || el.tagName === 'P';

/**
 * The plain text of a field's DOM (or of a fragment of it). Text nodes as-is, `<br>` as
 * a newline, and a `<div>`/`<p>` line starts on a new line — the shapes Chromium would
 * produce if text ever got in without going through the field's own handlers.
 */
export function readText(root: Node): string {
  let out = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
      return;
    const el = node as Element;
    if (el.tagName === 'BR') {
      // A <br> that's a block's last child only holds an empty line open.
      const parent = el.parentElement;
      if (!(parent && isBlock(parent) && parent.lastChild === el && parent !== root)) out += '\n';
      return;
    }
    const block = node !== root && !!el.tagName && isBlock(el);
    if (block && out !== '' && !out.endsWith('\n')) out += '\n';
    const before = out.length;
    node.childNodes.forEach(walk);
    // An empty block (`<div><br></div>`) is still a line of its own.
    if (block && out.length === before) out += '\n';
  };
  walk(root);
  return out;
}

/** The plain-string offset of a DOM position inside `root`. */
export function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return readText(range.cloneContents()).length;
}

/** The DOM position of a plain-string offset inside `root` (clamped to its end). */
export function domPointAt(root: Node, offset: number): { node: Node; offset: number } {
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    } else if ((node as Element).tagName === 'BR') {
      if (remaining === 0) {
        const parent = node.parentNode!;
        return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, node) };
      }
      remaining -= 1;
    }
    node = walker.nextNode();
  }
  return { node: root, offset: root.childNodes.length };
}

/** The selection inside `root` as plain-string offsets, or null when it's elsewhere. */
export function selectionOffsets(root: Node): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: textOffset(root, range.startContainer, range.startOffset),
    end: textOffset(root, range.endContainer, range.endOffset),
  };
}

/** Selects the plain-string range [start, end) inside `root` (a caret when equal). */
export function selectOffsets(root: Node, start: number, end = start): void {
  const sel = window.getSelection();
  if (!sel) return;
  const from = domPointAt(root, start);
  const to = end === start ? from : domPointAt(root, end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * The smallest edit turning `before` into `after`: replace [from, to) of `before` with
 * `insert`. Applied through the browser's own editing so it lands in the undo history.
 */
export function textEdit(before: string, after: string): { from: number; to: number; insert: string } {
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  };
}

import { jsonLanguage } from '@codemirror/lang-json';

/**
 * Why `text` isn't valid JSON and where: JSON.parse's verdict (trimmed — V8 echoes the
 * whole input or appends a position), placed at the first error the JSON grammar finds.
 * Null for valid JSON or blank text.
 */
export function jsonError(text: string): { message: string; at: number; line: number } | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (e: any) {
    const message = String(e?.message ?? 'Invalid JSON')
      // V8 echoes the input, cut short with "..." when long: `…, "{"a": }" is not valid JSON`.
      .replace(/,\s*(?:"|\.\.\.)[\s\S]* is not valid JSON$/, '')
      .replace(/ in JSON at position \d+.*$/, '')
      .trim();
    let at = text.length;
    jsonLanguage.parser.parse(text).iterate({
      enter(node) {
        if (at !== text.length) return false;
        if (node.type.isError) {
          at = node.from;
          return false;
        }
      },
    });
    const v8 = String(e?.message ?? '').match(/position (\d+)/);
    if (v8) at = Number(v8[1]);
    return { message, at, line: text.slice(0, at).split('\n').length };
  }
}

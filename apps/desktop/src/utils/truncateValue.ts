// Stringifies with per-field truncation applied *during* stringification, not
// after — task params/results/variables can carry multi-hundred-KB payloads
// (base64 attachments, large API responses), and re-stringifying them in full
// on every reactive re-render is what hangs the renderer on real data.
export function safeStringify(value: unknown, indent?: number): string {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === 'string' && val.length > 500) {
        return val.slice(0, 500) + `…[+${val.length - 500} chars]`;
      }
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    },
    indent
  );
}

export function formatValue(value: unknown, indent?: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return safeStringify(value, indent);
  return String(value);
}

export function truncateText(str: string, maxLength: number): string {
  return str.length > maxLength ? str.slice(0, maxLength) + '…' : str;
}

export function exceedsDisplayThreshold(str: string, maxLength = 300, maxLines = 3): boolean {
  return str.length > maxLength || (str.match(/\n/g) ?? []).length > maxLines;
}

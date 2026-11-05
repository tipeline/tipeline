// The JSON viewer's tree, flattened into the rows it draws: one per value, plus a
// closing row (`}` / `]`) after an open object or array's children. Which nodes are
// open is a set of paths, so expanding or collapsing is just changing the set.

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonRow {
  /** `a.b[0]` — "" for the root. */
  path: string;
  depth: number;
  /** Key in the parent object, index in the parent array; null for the root. */
  key: string | number | null;
  kind: JsonKind;
  value: unknown;
  /** Objects and arrays: how many keys / items, and whether the node is open. */
  size?: number;
  open?: boolean;
  /** The `}` / `]` after an open node's children. */
  closing?: boolean;
  /** "… N more" under an array or object that shows only part of its children. */
  more?: number;
  /** Whether a comma follows (not the last child). */
  comma?: boolean;
}

/** Children shown per object / array before a "show more" row (more come in steps of this). */
export const JSON_PAGE = 100;

export function jsonKind(value: unknown): JsonKind {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/** A string holding a JSON object or array is shown as that value; anything else as is. */
export function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!/^[[{]/.test(text)) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  if (IDENTIFIER.test(key)) return parent ? `${parent}.${key}` : key;
  return `${parent}[${JSON.stringify(key)}]`;
}

function entriesOf(value: unknown): Array<[string | number, unknown]> {
  if (Array.isArray(value)) return value.map((v, i) => [i, v]);
  return Object.entries(value as Record<string, unknown>);
}

/** Paths of every object / array, to open all (or of those above `depth` levels). */
export function containerPaths(value: unknown, depth = Infinity): Set<string> {
  const found = new Set<string>();
  const walk = (v: unknown, path: string, level: number) => {
    const kind = jsonKind(v);
    if ((kind !== 'object' && kind !== 'array') || level >= depth) return;
    found.add(path);
    for (const [k, child] of entriesOf(v)) walk(child, childPath(path, k), level + 1);
  };
  walk(value, '', 0);
  return found;
}

/**
 * The rows for `value` with the nodes in `open` expanded. `shown` holds, per path,
 * how many children an open node shows (default JSON_PAGE).
 */
export function jsonRows(value: unknown, open: Set<string>, shown: Record<string, number> = {}): JsonRow[] {
  const rows: JsonRow[] = [];
  const walk = (v: unknown, path: string, depth: number, key: string | number | null, comma: boolean) => {
    const kind = jsonKind(v);
    if (kind !== 'object' && kind !== 'array') {
      rows.push({ path, depth, key, kind, value: v, comma });
      return;
    }
    const entries = entriesOf(v);
    const isOpen = open.has(path) && entries.length > 0;
    rows.push({ path, depth, key, kind, value: v, size: entries.length, open: isOpen, comma: isOpen ? false : comma });
    if (!isOpen) return;
    const limit = shown[path] ?? JSON_PAGE;
    const visible = entries.slice(0, limit);
    visible.forEach(([k, child], i) =>
      walk(child, childPath(path, k), depth + 1, k, i < entries.length - 1)
    );
    if (entries.length > limit)
      rows.push({ path, depth: depth + 1, key: null, kind, value: undefined, more: entries.length - limit });
    rows.push({ path, depth, key: null, kind, value: undefined, closing: true, comma });
  };
  walk(value, '', 0, null, false);
  return rows;
}

/**
 * Sorting an app table's column by its raw values (not the formatted text): numbers as
 * numbers, dates as dates, text as people read it (case-insensitive, "item 2" before
 * "item 10"). Empty cells always go last, whichever way the column is sorted.
 */

export interface TableSortOptions {
  /** The column's `format` — number / currency / percent sort as numbers, date / datetime as dates. */
  format?: string;
  /** Whether the column is sorted descending (TanStack flips the result for that). */
  desc?: boolean;
  locale?: string;
}

/** One sorted column (TanStack's SortingState entry). */
export interface TableSort {
  id: string;
  desc: boolean;
}

const NUMERIC = new Set(['number', 'currency', 'percent']);
const DATES = new Set(['date', 'datetime']);

const isEmpty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return typeof v === 'string' ? Number(v.trim()) : NaN;
}

function asTime(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  return typeof v === 'string' ? Date.parse(v) : NaN;
}

function asText(v: unknown): string {
  if (Array.isArray(v)) return v.map(asText).join(', ');
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** -1 / 0 / 1 for two cells of a column, ascending (empties last either way). */
export function compareTableValues(
  a: unknown,
  b: unknown,
  options: TableSortOptions = {}
): number {
  const emptyA = isEmpty(a);
  const emptyB = isEmpty(b);
  if (emptyA || emptyB) {
    if (emptyA && emptyB) return 0;
    // TanStack flips the result of a descending column: flip it first so empties stay last.
    const last = emptyA ? 1 : -1;
    return options.desc ? -last : last;
  }

  const { format } = options;
  const numeric =
    NUMERIC.has(format ?? '') ||
    (typeof a === 'number' && typeof b === 'number');
  const dates =
    DATES.has(format ?? '') || (a instanceof Date && b instanceof Date);
  const bools = typeof a === 'boolean' && typeof b === 'boolean';
  if (numeric || dates || bools) {
    const x = dates ? asTime(a) : asNumber(a);
    const y = dates ? asTime(b) : asNumber(b);
    // A value that doesn't read as one goes after those that do, sorted as text.
    if (!Number.isNaN(x) && !Number.isNaN(y)) return Math.sign(x - y);
    if (!Number.isNaN(x)) return -1;
    if (!Number.isNaN(y)) return 1;
  }
  return Math.sign(
    asText(a).localeCompare(asText(b), options.locale, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/** A table's `sortBy` / `sortOrder` props as the sort it starts with (none without a key). */
export function initialTableSort(
  sortBy: unknown,
  sortOrder: unknown
): TableSort[] {
  if (typeof sortBy !== 'string' || !sortBy.trim()) return [];
  return [{ id: sortBy.trim(), desc: sortOrder === 'desc' }];
}

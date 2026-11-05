/**
 * How a table's columns fit its width:
 * - scroll: each column is as wide as its content; a wide table scrolls sideways.
 * - wrap: columns share the width by how much they hold; long values wrap onto more lines.
 * - truncate: the same widths; long values end in "…".
 */
export type TableFit = 'scroll' | 'wrap' | 'truncate';

/** Sizing a column can carry in its `meta` (next to `class`). */
export interface TableColumnSize {
  /** Exactly this many pixels wide (button / checkbox columns, or a column's `width`). */
  width?: number;
  /** Never narrower than this; past it the table scrolls instead. */
  minWidth?: number;
  /** wrap / truncate: the characters a value takes (default: its text). */
  measure?: (value: unknown, row: unknown) => number;
}

export interface TableFitColumn extends TableColumnSize {
  id: string;
  header: string;
}

/** The narrowest a shared column gets (wrap / truncate) before the table scrolls. */
export const FIT_MIN_COLUMN = 56;
/** What a shared column keeps, if its content is that wide, before others grow. */
export const FIT_COMFORT_COLUMN = 120;
/** About a character of cell text (14px), and a cell's side padding. */
const CHAR_PX = 8;
const CELL_PAD = 24;

const SAMPLE_ROWS = 200;
const MIN_CHARS = 4;
const MAX_CHARS = 40;

function textLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object') return JSON.stringify(value).length;
  return String(value).length;
}

/**
 * How many characters a column needs: its header, or most of its values (the 90th
 * percentile, so one very long value doesn't take the width from the rest), within
 * 4–40 so short columns stay readable and long ones don't take everything.
 */
export function columnWeight(
  column: TableFitColumn,
  rows: unknown[],
  valueOf: (row: unknown, id: string) => unknown
): number {
  const lengths = rows
    .slice(0, SAMPLE_ROWS)
    .map((row) => {
      const value = valueOf(row, column.id);
      return column.measure ? column.measure(value, row) : textLength(value);
    })
    .sort((a, b) => a - b);
  const typical = lengths.length ? lengths[Math.ceil(lengths.length * 0.9) - 1] : 0;
  return Math.min(MAX_CHARS, Math.max(MIN_CHARS, column.header.length, typical));
}

export interface TableFitLayout {
  /** Per column: its `width` (a px or % length). */
  widths: Record<string, string>;
  /** The table's own min-width in px (it scrolls sideways below that), or 0. */
  minWidth: number;
}

/**
 * wrap / truncate: a fixed table layout. Pixel columns keep their width; the others
 * share what's left:
 * 1. each gets up to FIT_COMFORT_COLUMN of its natural width (its typical content), so
 *    short values — amounts, dates — aren't cut while long ones still fit;
 * 2. what's left goes by weight to the columns still narrower than their content;
 * 3. short of room, columns whose content is cut anyway shrink first, then the
 *    others — each down to its minimum (its minWidth, at least FIT_MIN_COLUMN); below
 *    the minimums the table scrolls sideways.
 *
 * `available` is the table's width in px; before it is known the shares are
 * percentages of the natural widths.
 */
export function fitLayout(
  columns: TableFitColumn[],
  rows: unknown[],
  valueOf: (row: unknown, id: string) => unknown,
  available?: number
): TableFitLayout {
  const widths: Record<string, string> = {};
  let fixed = 0;
  const shared: Array<{ id: string; weight: number; min: number; comfort: number; natural: number }> = [];
  for (const column of columns) {
    if (column.width) {
      widths[column.id] = `${column.width}px`;
      fixed += column.width;
      continue;
    }
    const weight = columnWeight(column, rows, valueOf);
    const min = Math.max(column.minWidth ?? 0, FIT_MIN_COLUMN);
    const natural = Math.max(weight * CHAR_PX + CELL_PAD, min);
    shared.push({ id: column.id, weight, min, natural, comfort: Math.max(Math.min(natural, FIT_COMFORT_COLUMN), min) });
  }
  const sum = (key: 'min' | 'comfort' | 'natural' | 'weight', list = shared) =>
    list.reduce((total, c) => total + c[key], 0);
  const minWidth = fixed + sum('min');

  if (!available) {
    const total = sum('natural');
    for (const c of shared) widths[c.id] = `${+((c.natural / total) * 100).toFixed(3)}%`;
    return { widths, minWidth };
  }

  const room = available - fixed;
  const size = new Map<string, number>();
  if (room <= sum('comfort')) {
    // 3. Short of room. Columns already cut (content wider than comfortable) give up
    // room first, so short values (amounts, dates) stay whole as long as they can.
    const cut = shared.filter((c) => c.natural > c.comfort);
    const whole = shared.filter((c) => c.natural <= c.comfort);
    const shrink = (list: typeof shared, space: number) => {
      const spare = sum('comfort', list) - sum('min', list);
      const part = spare > 0 ? Math.min(1, Math.max(0, space - sum('min', list)) / spare) : 0;
      for (const c of list) size.set(c.id, c.min + (c.comfort - c.min) * part);
    };
    const forCut = room - sum('comfort', whole);
    if (forCut >= sum('min', cut)) {
      shrink(whole, sum('comfort', whole));
      shrink(cut, forCut);
    } else {
      shrink(cut, 0);
      shrink(whole, room - sum('min', cut));
    }
  } else {
    // 1–2. Comfortable widths, then the rest by weight up to each one's content.
    for (const c of shared) size.set(c.id, c.comfort);
    let left = room - sum('comfort');
    let growing = shared.filter((c) => c.natural > c.comfort);
    while (left > 0.5 && growing.length) {
      const total = sum('weight', growing);
      let given = 0;
      for (const c of growing) {
        const add = Math.min((left * c.weight) / total, c.natural - size.get(c.id)!);
        size.set(c.id, size.get(c.id)! + add);
        given += add;
      }
      left -= given;
      growing = growing.filter((c) => size.get(c.id)! < c.natural - 0.5);
    }
    // Every column shows all its content: the table's own width shares out the rest.
  }
  for (const c of shared) widths[c.id] = `${Math.floor(size.get(c.id)!)}px`;
  return { widths, minWidth };
}

/** scroll: a column's width settings as inline styles of its cells. */
export function columnSizeStyle(size: TableColumnSize | undefined): Record<string, string> {
  if (size?.width) {
    const px = `${size.width}px`;
    return { width: px, minWidth: px, maxWidth: px };
  }
  return size?.minWidth ? { minWidth: `${size.minWidth}px` } : {};
}

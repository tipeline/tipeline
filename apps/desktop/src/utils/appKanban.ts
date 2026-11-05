import { badgeColor, type BadgeColor } from './appBadge';
import { valueAt } from './appFormat';

// A Kanban board's columns and cards. Each row is a card in the column its `groupKey`
// names (default `status`). Columns come from `columns` — values, or { value, label,
// color, limit } — or, without them, from the values the rows have, first seen first.
// Rows whose value has no column go in an extra "Other" column (not a drop target).
//
// A card dragged to another place moves there at once (a local move, kept until the
// board's data is replaced — the workflow saved it and the list was read again, or
// it failed and the list was read again: then the card goes back).

export interface KanbanColumnDef {
  value: unknown;
  label?: string;
  color?: unknown;
  limit?: unknown;
}

export interface KanbanCard {
  key: string;
  row: Record<string, unknown>;
  /** Position in `data`. */
  index: number;
  title: string;
  color: BadgeColor | null;
}

export interface KanbanColumn {
  /** The column's value as given (a card moved here gets it); `id` is it as text. */
  value: unknown;
  id: string;
  label: string;
  color: BadgeColor | null;
  limit: number | null;
  cards: KanbanCard[];
  /** The extra column for rows whose value has no column of its own. */
  other?: boolean;
}

export interface KanbanOptions {
  groupKey?: string;
  columns?: unknown;
  titleKey?: string;
  rowKey?: string;
  colorKey?: string;
  colors?: Record<string, unknown> | null;
}

/** A local move: the card goes to column `to` (its id), at `index` in it. */
export interface KanbanMove {
  key: string;
  to: string;
  index: number;
}

export const OTHER_COLUMN = '\u0000other';

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function columnDefs(columns: unknown): KanbanColumnDef[] | null {
  if (!Array.isArray(columns) || !columns.length) return null;
  return columns
    .map((c) => (c && typeof c === 'object' && 'value' in c ? (c as KanbanColumnDef) : { value: c }))
    .filter((c) => c.value !== undefined && c.value !== null && c.value !== '');
}

export function cardKey(row: Record<string, unknown>, index: number, rowKey = 'id'): string {
  const key = valueAt(row, rowKey);
  return key === undefined || key === null || key === '' ? `#${index}` : String(key);
}

export function kanbanBoard(data: unknown, options: KanbanOptions = {}, moves: KanbanMove[] = []): KanbanColumn[] {
  const rows = (Array.isArray(data) ? data : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  const groupKey = options.groupKey || 'status';
  const group = (row: Record<string, unknown>) => text(valueAt(row, groupKey));

  // The columns: as given, or the rows' values in the order they first appear.
  const defs =
    columnDefs(options.columns) ??
    rows.reduce<KanbanColumnDef[]>((list, row) => {
      const value = valueAt(row, groupKey);
      if (value !== undefined && value !== null && value !== '' && !list.some((c) => text(c.value) === text(value)))
        list.push({ value });
      return list;
    }, []);
  const columns: KanbanColumn[] = defs.map((c) => {
    const limit = Number(c.limit);
    return {
      value: c.value,
      id: text(c.value),
      label: c.label ?? text(c.value),
      color: c.color === undefined ? null : badgeColor(c.value, null, c.color),
      limit: Number.isInteger(limit) && limit > 0 ? limit : null,
      cards: [],
    };
  });
  const other: KanbanColumn = { value: null, id: OTHER_COLUMN, label: '', color: null, limit: null, cards: [], other: true };
  const byId = new Map(columns.map((c) => [c.id, c]));

  rows.forEach((row, index) => {
    const title = valueAt(row, options.titleKey || '') ?? row.name ?? row.title ?? row.label ?? row.id;
    const card: KanbanCard = {
      key: cardKey(row, index, options.rowKey),
      row,
      index,
      title: text(title),
      color: options.colorKey ? badgeColor(valueAt(row, options.colorKey), options.colors) : null,
    };
    (byId.get(group(row)) ?? other).cards.push(card);
  });

  // Local moves, in the order they were made.
  for (const move of moves) {
    const target = byId.get(move.to);
    if (!target) continue;
    const from = [...columns, other].find((c) => c.cards.some((card) => card.key === move.key));
    if (!from) continue;
    const at = from.cards.findIndex((card) => card.key === move.key);
    const [card] = from.cards.splice(at, 1);
    target.cards.splice(Math.max(0, Math.min(move.index, target.cards.length)), 0, card);
  }
  return other.cards.length ? [...columns, other] : columns;
}

/** Where a card is now: its column and its place in it. */
export function cardPlace(board: KanbanColumn[], key: string): { column: KanbanColumn; index: number } | null {
  for (const column of board) {
    const index = column.cards.findIndex((c) => c.key === key);
    if (index >= 0) return { column, index };
  }
  return null;
}

/**
 * Where a card dropped at `index` of column `to` (counted with the card still in its
 * old place) ends up; null when it doesn't move. `index` afterwards is its place in
 * the column once it's there.
 */
export function resolveDrop(
  board: KanbanColumn[],
  key: string,
  to: string,
  index: number
): { from: KanbanColumn; fromIndex: number; to: KanbanColumn; index: number } | null {
  const place = cardPlace(board, key);
  const target = board.find((c) => c.id === to && !c.other);
  if (!place || !target) return null;
  let at = Math.max(0, Math.min(index, target.cards.length));
  if (place.column === target) {
    if (at > place.index) at -= 1; // its own old place no longer counts
    if (at === place.index) return null;
  }
  return { from: place.column, fromIndex: place.index, to: target, index: at };
}

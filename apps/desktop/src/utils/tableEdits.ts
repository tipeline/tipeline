// Unsaved edits of an editable app table, and what they add up to. The edits live
// in the table's runtime state (so `reset` can drop them); everything else here is
// derived from them and the table's `data`.

export type TableEditor = 'text' | 'number' | 'date' | 'checkbox' | 'select';

export interface EditableColumn {
  key: string;
  format?: string;
  editable?: boolean;
  editor?: TableEditor;
  required?: boolean;
  default?: unknown;
}

type Row = Record<string, unknown>;

/** What the table keeps between renders. Rows are known by `rowKeyOf`. */
export interface TableEditState {
  /** Changed cells of existing rows: row key → column → new value. */
  edits: Record<string, Row>;
  /** Rows added with "Add row", in order. */
  added: Array<{ key: string; values: Row }>;
  /** Keys of existing rows marked for deletion. */
  deleted: string[];
}

/** What the table exposes: `TABLE_ID.changes.added / updated / deleted`. */
export interface TableChanges {
  added: Row[];
  updated: Row[];
  deleted: Row[];
}

export interface TableViewRow {
  key: string;
  /** The row as shown: the original with its edits, or an added row's values. */
  row: Row;
  status: 'clean' | 'edited' | 'added' | 'deleted';
  /** Columns whose value differs from the original. */
  changed: Set<string>;
}

export function emptyTableEdits(): TableEditState & { changes: TableChanges; hasChanges: boolean } {
  return {
    edits: {},
    added: [],
    deleted: [],
    changes: { added: [], updated: [], deleted: [] },
    hasChanges: false,
  };
}

/** A row's identity: its `rowKey` column when set and present, else its position in `data`. */
export function rowKeyOf(row: Row, index: number, rowKey?: string): string {
  const id = rowKey ? row[rowKey] : undefined;
  return id === undefined || id === null || id === '' ? `#${index}` : `=${String(id)}`;
}

/** The editor a column uses: its own, else one that fits its format. */
export function editorOf(column: EditableColumn): TableEditor {
  if (column.editor) return column.editor;
  if (column.format === 'number' || column.format === 'currency' || column.format === 'percent') return 'number';
  if (column.format === 'date' || column.format === 'datetime') return 'date';
  return 'text';
}

/** A value typed into an editor, as the type the column holds. */
export function coerceCell(raw: unknown, editor: TableEditor): unknown {
  switch (editor) {
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return null;
      const n = Number(raw);
      return Number.isNaN(n) ? null : n;
    }
    case 'checkbox':
      return raw === true || raw === 'true';
    default:
      return raw ?? '';
  }
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const isEmptyCell = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/** Every row in display order: existing rows (edited, deleted or not), then added ones. */
export function viewRows(data: Row[], state: TableEditState, rowKey?: string): TableViewRow[] {
  const deleted = new Set(state.deleted);
  const rows: TableViewRow[] = data.map((original, index) => {
    const key = rowKeyOf(original, index, rowKey);
    const edits = state.edits[key] ?? {};
    const changed = new Set(Object.keys(edits).filter((col) => !same(edits[col], original[col])));
    return {
      key,
      row: changed.size ? { ...original, ...edits } : original,
      status: deleted.has(key) ? 'deleted' : changed.size ? 'edited' : 'clean',
      changed,
    };
  });
  for (const added of state.added) {
    rows.push({ key: added.key, row: added.values, status: 'added', changed: new Set() });
  }
  return rows;
}

/** What would be saved. An edited row that is also deleted only counts as deleted. */
export function tableChanges(view: TableViewRow[], data: Row[]): TableChanges {
  const originals = new Map(view.filter((r) => r.status !== 'added').map((r, i) => [r.key, data[i]]));
  return {
    added: view.filter((r) => r.status === 'added').map((r) => r.row),
    updated: view.filter((r) => r.status === 'edited').map((r) => r.row),
    deleted: view.filter((r) => r.status === 'deleted').map((r) => originals.get(r.key)!),
  };
}

export const changeCount = (changes: TableChanges) =>
  changes.added.length + changes.updated.length + changes.deleted.length;

/** Required cells left empty in rows that would be saved, as "rowKey/column". */
export function invalidCells(view: TableViewRow[], columns: EditableColumn[]): Set<string> {
  const required = columns.filter((c) => c.editable && c.required);
  const invalid = new Set<string>();
  for (const r of view) {
    if (r.status !== 'added' && r.status !== 'edited') continue;
    for (const c of required) if (isEmptyCell(r.row[c.key])) invalid.add(`${r.key}/${c.key}`);
  }
  return invalid;
}

/** Sets one cell. A value equal to the original drops the edit instead. */
export function setCell(state: TableEditState, key: string, column: string, value: unknown, original?: Row): TableEditState {
  const added = state.added.find((a) => a.key === key);
  if (added) {
    return {
      ...state,
      added: state.added.map((a) => (a === added ? { key, values: { ...a.values, [column]: value } } : a)),
    };
  }
  const row = { ...(state.edits[key] ?? {}) };
  if (original && same(original[column], value)) delete row[column];
  else row[column] = value;
  const edits = { ...state.edits };
  if (Object.keys(row).length) edits[key] = row;
  else delete edits[key];
  return { ...state, edits };
}

/** Adds a row whose cells start at each column's `default` (null when it has none). */
export function addRow(state: TableEditState, columns: EditableColumn[]): TableEditState {
  let n = state.added.length + 1;
  while (state.added.some((a) => a.key === `+${n}`)) n++;
  const values = Object.fromEntries(columns.map((c) => [c.key, c.default === undefined ? null : c.default]));
  return { ...state, added: [...state.added, { key: `+${n}`, values }] };
}

/** Deletes a row: an added one goes away, an existing one is marked (or unmarked, again). */
export function toggleDelete(state: TableEditState, key: string): TableEditState {
  if (state.added.some((a) => a.key === key)) {
    return { ...state, added: state.added.filter((a) => a.key !== key) };
  }
  const deleted = state.deleted.includes(key) ? state.deleted.filter((k) => k !== key) : [...state.deleted, key];
  return { ...state, deleted };
}

/** A table's checked rows (multiSelect): keys as `rowKeyOf` gives them, and the rows. */
export function emptyTableSelection(): { selectedKeys: string[]; selectedRows: Row[] } {
  return { selectedKeys: [], selectedRows: [] };
}

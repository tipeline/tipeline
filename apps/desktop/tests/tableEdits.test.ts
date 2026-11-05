import { describe, expect, it } from 'vitest';
import {
  addRow,
  changeCount,
  coerceCell,
  editorOf,
  emptyTableEdits,
  invalidCells,
  rowKeyOf,
  setCell,
  tableChanges,
  toggleDelete,
  viewRows,
  type TableEditState,
} from '@/utils/tableEdits';

const data = [
  { id: 1, name: 'Acme', amount: 100 },
  { id: 2, name: 'Globex', amount: 200 },
  { id: 3, name: 'Initech', amount: 300 },
];
const columns = [
  { key: 'id' },
  { key: 'name', editable: true, required: true },
  { key: 'amount', format: 'currency', editable: true, default: 0 },
];

const fresh = (): TableEditState => {
  const { edits, added, deleted } = emptyTableEdits();
  return { edits, added, deleted };
};

const changesOf = (state: TableEditState, rowKey?: string) =>
  tableChanges(viewRows(data, state, rowKey), data);

describe('tableEdits', () => {
  it('knows a row by its rowKey column, else by its position', () => {
    expect(rowKeyOf({ id: 7 }, 0, 'id')).toBe('=7');
    expect(rowKeyOf({ id: null }, 2, 'id')).toBe('#2');
    expect(rowKeyOf({ id: 7 }, 4)).toBe('#4');
  });

  it('picks an editor from the column format, and coerces typed values', () => {
    expect(editorOf({ key: 'a', format: 'currency' })).toBe('number');
    expect(editorOf({ key: 'a', format: 'datetime' })).toBe('date');
    expect(editorOf({ key: 'a', format: 'number', editor: 'select' })).toBe('select');
    expect(editorOf({ key: 'a' })).toBe('text');
    expect(coerceCell('12.5', 'number')).toBe(12.5);
    expect(coerceCell('', 'number')).toBeNull();
    expect(coerceCell('abc', 'number')).toBeNull();
    expect(coerceCell('true', 'checkbox')).toBe(true);
  });

  it('collects edited rows as whole rows with their new values', () => {
    let state = setCell(fresh(), '=2', 'amount', 250, data[1]);
    state = setCell(state, '=2', 'name', 'Globex Inc', data[1]);
    expect(changesOf(state, 'id')).toEqual({
      added: [],
      updated: [{ id: 2, name: 'Globex Inc', amount: 250 }],
      deleted: [],
    });
    const view = viewRows(data, state, 'id');
    expect(view[1].status).toBe('edited');
    expect([...view[1].changed].sort()).toEqual(['amount', 'name']);
  });

  it('changing a cell back to its saved value drops the edit', () => {
    let state = setCell(fresh(), '=1', 'amount', 150, data[0]);
    state = setCell(state, '=1', 'amount', 100, data[0]);
    expect(state.edits).toEqual({});
    expect(changeCount(changesOf(state, 'id'))).toBe(0);
  });

  it('edits follow the row key, not the position, when data is re-ordered', () => {
    const state = setCell(fresh(), '=3', 'name', 'Initrode', data[2]);
    const reordered = [data[2], data[0], data[1]];
    expect(tableChanges(viewRows(reordered, state, 'id'), reordered).updated).toEqual([
      { id: 3, name: 'Initrode', amount: 300 },
    ]);
  });

  it('adds rows with column defaults, edits them, and removes them again', () => {
    let state = addRow(fresh(), columns);
    state = addRow(state, columns);
    expect(state.added.map((a) => a.key)).toEqual(['+1', '+2']);
    state = setCell(state, '+1', 'name', 'Hooli');
    expect(changesOf(state).added).toEqual([
      { id: null, name: 'Hooli', amount: 0 },
      { id: null, name: null, amount: 0 },
    ]);
    state = toggleDelete(state, '+2');
    expect(state.added.map((a) => a.key)).toEqual(['+1']);
    // a new key never reuses one still in use
    expect(addRow(state, columns).added.map((a) => a.key)).toEqual(['+1', '+2']);
  });

  it('marks existing rows deleted (with their saved values), and restores them', () => {
    let state = setCell(fresh(), '=1', 'amount', 1, data[0]);
    state = toggleDelete(state, '=1');
    expect(changesOf(state, 'id')).toEqual({ added: [], updated: [], deleted: [data[0]] });
    state = toggleDelete(state, '=1');
    expect(changesOf(state, 'id').updated).toEqual([{ id: 1, name: 'Acme', amount: 1 }]);
  });

  it('flags required cells left empty, only in rows that would be saved', () => {
    let state = setCell(fresh(), '=1', 'name', ' ', data[0]);
    state = addRow(state, columns);
    state = toggleDelete(setCell(state, '=2', 'name', '', data[1]), '=2');
    expect([...invalidCells(viewRows(data, state, 'id'), columns)].sort()).toEqual(['+1/name', '=1/name']);
  });
});

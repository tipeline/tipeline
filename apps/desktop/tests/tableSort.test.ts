import { describe, expect, it } from 'vitest';
import { compareTableValues, initialTableSort } from '@/utils/tableSort';

const sorted = (values: unknown[], options = {}) =>
  [...values].sort((a, b) => compareTableValues(a, b, options));

describe('compareTableValues', () => {
  it('sorts text case-insensitively, with numbers inside read as numbers', () => {
    expect(sorted(['item 10', 'Item 2', 'banana', 'Apple'])).toEqual([
      'Apple',
      'banana',
      'Item 2',
      'item 10',
    ]);
  });

  it('sorts number columns by value, numeric strings included', () => {
    expect(sorted(['100', 9, '20.5', -1], { format: 'currency' })).toEqual([
      -1,
      9,
      '20.5',
      '100',
    ]);
    expect(sorted([10, 9, 100])).toEqual([9, 10, 100]);
  });

  it('sorts date columns by time, not by their text', () => {
    expect(
      sorted(['2024-03-01T10:00:00Z', '2023-12-31', '2024-01-15'], {
        format: 'date',
      })
    ).toEqual(['2023-12-31', '2024-01-15', '2024-03-01T10:00:00Z']);
  });

  it('puts values that are not numbers / dates after the ones that are', () => {
    expect(sorted(['n/a', 5, 2], { format: 'number' })).toEqual([2, 5, 'n/a']);
  });

  it('keeps empty cells last, ascending and descending', () => {
    const values = ['b', null, '', 'a', undefined, []];
    expect(sorted(values).slice(0, 2)).toEqual(['a', 'b']);
    // TanStack flips a descending column's result: emulate it.
    const desc = [...values].sort(
      (a, b) => -compareTableValues(a, b, { desc: true })
    );
    expect(desc.slice(0, 2)).toEqual(['b', 'a']);
    expect(
      desc.slice(2).every((v) => v == null || v === '' || Array.isArray(v))
    ).toBe(true);
  });

  it('sorts booleans false first, and lists (tags) by their text', () => {
    expect(sorted([true, false])).toEqual([false, true]);
    expect(
      sorted([
        ['b', 'c'],
        ['a', 'z'],
      ])
    ).toEqual([
      ['a', 'z'],
      ['b', 'c'],
    ]);
  });
});

describe('initialTableSort', () => {
  it('reads sortBy / sortOrder (ascending unless desc)', () => {
    expect(initialTableSort('date', 'desc')).toEqual([
      { id: 'date', desc: true },
    ]);
    expect(initialTableSort(' name ', undefined)).toEqual([
      { id: 'name', desc: false },
    ]);
    expect(initialTableSort('', 'desc')).toEqual([]);
    expect(initialTableSort(undefined, 'asc')).toEqual([]);
  });
});

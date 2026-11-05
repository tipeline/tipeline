import { describe, expect, it } from 'vitest';
import { GroupArray } from '@/action/actions/array/actions';

describe('GroupArray', () => {
  describe('parse', () => {
    it('parses a JSON array string (default type)', () => {
      expect(GroupArray.parse({ text: '[1,2,3]' } as any)).toEqual([1, 2, 3]);
    });

    it('parses a CSV string with trimming', () => {
      expect(GroupArray.parse({ text: 'a, b, c', type: 'csv' } as any)).toEqual(['a', 'b', 'c']);
    });

    it('parses a lines string and drops empty lines', () => {
      expect(GroupArray.parse({ text: 'a\nb\n\nc', type: 'lines' } as any)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('parses using a custom separator', () => {
      expect(GroupArray.parse({ text: 'a|b|c', type: 'custom', separator: '|' } as any)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('coerces elements to numbers when elementType is number', () => {
      expect(
        GroupArray.parse({ text: '1,2,3', type: 'csv', elementType: 'number' } as any)
      ).toEqual([1, 2, 3]);
    });

    it('throws a descriptive error for invalid JSON', () => {
      expect(() => GroupArray.parse({ text: 'not json', type: 'json' } as any)).toThrow(
        /Failed to parse text to array/
      );
    });

    it('throws when text is missing', () => {
      expect(() => GroupArray.parse({} as any)).toThrow();
    });
  });

  describe('toString', () => {
    it('joins with the default comma separator (csv format)', () => {
      expect(GroupArray.toString({ array: [1, 2, 3] } as any)).toBe('1,2,3');
    });

    it('formats as a JSON string', () => {
      expect(GroupArray.toString({ array: [1, 'a'], format: 'json' } as any)).toBe('[1,"a"]');
    });

    it('formats as newline-separated lines', () => {
      expect(GroupArray.toString({ array: ['a', 'b'], format: 'lines' } as any)).toBe('a\nb');
    });

    it('returns an empty string for an empty array', () => {
      expect(GroupArray.toString({ array: [] } as any)).toBe('');
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.toString({} as any)).toThrow();
    });
  });

  describe('join', () => {
    it('joins elements with the default separator', () => {
      expect(GroupArray.join({ array: ['a', 'b', 'c'] } as any)).toBe('a,b,c');
    });

    it('joins elements with a custom separator', () => {
      expect(GroupArray.join({ array: ['a', 'b'], separator: ' | ' })).toBe('a | b');
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.join({} as any)).toThrow();
    });
  });

  describe('length', () => {
    it('returns the number of elements', () => {
      expect(GroupArray.length({ array: [1, 2, 3] })).toBe(3);
    });

    it('returns 0 for an empty array', () => {
      expect(GroupArray.length({ array: [] })).toBe(0);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.length({} as any)).toThrow();
    });
  });

  describe('contains', () => {
    it('returns true when the value is present', () => {
      expect(GroupArray.contains({ array: ['a', 'b'], value: 'b' })).toBe(true);
    });

    it('returns false when the value is absent', () => {
      expect(GroupArray.contains({ array: ['a', 'b'], value: 'z' })).toBe(false);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.contains({ value: 'a' } as any)).toThrow();
    });
  });

  describe('indexOf', () => {
    it('returns the index of the first occurrence', () => {
      expect(GroupArray.indexOf({ array: ['a', 'b', 'a'], value: 'a' })).toBe(0);
    });

    it('returns -1 when not found', () => {
      expect(GroupArray.indexOf({ array: ['a', 'b'], value: 'z' })).toBe(-1);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.indexOf({ value: 'a' } as any)).toThrow();
    });
  });

  describe('get', () => {
    it('gets the element at a positive index', () => {
      expect(GroupArray.get({ array: [10, 20, 30], index: 1 } as any)).toBe(20);
    });

    it('supports negative indices from the end', () => {
      expect(GroupArray.get({ array: [10, 20, 30], index: -1 } as any)).toBe(30);
    });

    it('returns the default value when out of bounds', () => {
      expect(GroupArray.get({ array: [10, 20], index: 5, defaultValue: 'fallback' } as any)).toBe(
        'fallback'
      );
    });

    it('throws when index is missing', () => {
      expect(() => GroupArray.get({ array: [1, 2] } as any)).toThrow();
    });
  });

  describe('push', () => {
    it('pushes a value to the end by default', () => {
      expect(GroupArray.push({ array: [1, 2], value: 3 } as any)).toEqual([1, 2, 3]);
    });

    it('pushes a value to the start when position is start', () => {
      expect(GroupArray.push({ array: [2, 3], value: 1, position: 'start' })).toEqual([1, 2, 3]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.push({ value: 1 } as any)).toThrow();
    });
  });

  describe('set', () => {
    it('updates the element at a positive index', () => {
      expect(GroupArray.set({ array: ['a', 'b', 'c'], index: 1, value: 'x' } as any)).toEqual([
        'a',
        'x',
        'c',
      ]);
    });

    it('supports negative indices from the end', () => {
      expect(GroupArray.set({ array: ['a', 'b', 'c'], index: -1, value: 'x' } as any)).toEqual([
        'a',
        'b',
        'x',
      ]);
    });

    it('throws when the index is out of bounds', () => {
      expect(() => GroupArray.set({ array: ['a'], index: 5, value: 'x' } as any)).toThrow(
        /out of bounds/
      );
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.set({ index: 0, value: 'x' } as any)).toThrow();
    });
  });

  describe('remove', () => {
    it('removes the element at the given index', () => {
      expect(GroupArray.remove({ array: ['a', 'b', 'c'], index: 1 } as any)).toEqual(['a', 'c']);
    });

    it('throws when the index is out of bounds', () => {
      expect(() => GroupArray.remove({ array: ['a'], index: 5 } as any)).toThrow(/out of bounds/);
    });

    it('throws (validation) when index is negative', () => {
      expect(() => GroupArray.remove({ array: ['a'], index: -1 } as any)).toThrow();
    });
  });

  describe('unique', () => {
    it('removes duplicate values', () => {
      expect(GroupArray.unique({ array: ['pdf', 'invoice', 'pdf', 'ocr'] })).toEqual([
        'pdf',
        'invoice',
        'ocr',
      ]);
    });

    it('returns an empty array unchanged', () => {
      expect(GroupArray.unique({ array: [] })).toEqual([]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.unique({} as any)).toThrow();
    });
  });

  describe('compact', () => {
    it('removes falsy values', () => {
      expect(GroupArray.compact({ array: ['pdf', null, '', false, 'invoice', 0, 'ocr'] })).toEqual([
        'pdf',
        'invoice',
        'ocr',
      ]);
    });

    it('returns an empty array when all values are falsy', () => {
      expect(GroupArray.compact({ array: [null, undefined, false, 0, ''] })).toEqual([]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.compact({} as any)).toThrow();
    });
  });

  describe('chunk', () => {
    it('splits an array into evenly sized chunks', () => {
      expect(GroupArray.chunk({ array: [1, 2, 3, 4], size: 2 })).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });

    it('includes a smaller final chunk when the size does not divide evenly', () => {
      expect(GroupArray.chunk({ array: [1, 2, 3, 4, 5], size: 2 })).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('throws (validation) when size is less than 1', () => {
      expect(() => GroupArray.chunk({ array: [1, 2], size: 0 })).toThrow();
    });
  });

  describe('flatten', () => {
    it('flattens one level of nesting by default', () => {
      expect(GroupArray.flatten({ array: [1, [2, 3], [4]] } as any)).toEqual([1, 2, 3, 4]);
    });

    it('flattens deeper nesting when depth is specified', () => {
      expect(GroupArray.flatten({ array: [1, [2, [3, [4]]]], depth: 3 } as any)).toEqual([
        1, 2, 3, 4,
      ]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.flatten({} as any)).toThrow();
    });
  });

  describe('intersection', () => {
    it('returns elements common to all arrays', () => {
      expect(
        GroupArray.intersection({
          arrays: [
            ['pdf', 'ocr', 'invoice'],
            ['ocr', 'invoice'],
          ],
        })
      ).toEqual(['ocr', 'invoice']);
    });

    it('returns an empty array when there is no overlap', () => {
      expect(
        GroupArray.intersection({
          arrays: [
            ['a', 'b'],
            ['c', 'd'],
          ],
        })
      ).toEqual([]);
    });

    it('throws when arrays is missing', () => {
      expect(() => GroupArray.intersection({} as any)).toThrow();
    });
  });

  describe('union', () => {
    it('combines arrays and removes duplicates', () => {
      expect(
        GroupArray.union({
          arrays: [
            ['a', 'b'],
            ['b', 'c'],
          ],
        })
      ).toEqual(['a', 'b', 'c']);
    });

    it('throws when arrays is missing', () => {
      expect(() => GroupArray.union({} as any)).toThrow();
    });
  });

  describe('difference', () => {
    it('returns elements in the first array not present in the second', () => {
      expect(GroupArray.difference({ array: ['a', 'b', 'c'], exclude: ['b'] })).toEqual(['a', 'c']);
    });

    it('returns the full array when exclude is empty', () => {
      expect(GroupArray.difference({ array: ['a', 'b'], exclude: [] })).toEqual(['a', 'b']);
    });

    it('throws when exclude is missing', () => {
      expect(() => GroupArray.difference({ array: ['a'] } as any)).toThrow();
    });
  });

  describe('sort', () => {
    it('sorts objects by a key ascending', () => {
      expect(
        GroupArray.sort({
          array: [
            { name: 'pdf', size: 18 },
            { name: 'ocr', size: 75 },
            { name: 'invoice', size: 42 },
          ],
          keys: ['size'],
          orders: ['asc'],
        } as any)
      ).toEqual([
        { name: 'pdf', size: 18 },
        { name: 'invoice', size: 42 },
        { name: 'ocr', size: 75 },
      ]);
    });

    it('falls back to default array sort when no keys are given (lexicographic for numbers)', () => {
      expect(GroupArray.sort({ array: [10, 1, 2] } as any)).toEqual([1, 10, 2]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.sort({} as any)).toThrow();
    });
  });

  describe('reverse', () => {
    it('reverses the order of elements', () => {
      expect(GroupArray.reverse({ array: [1, 2, 3] })).toEqual([3, 2, 1]);
    });

    it('does not mutate the input array', () => {
      const array = [1, 2, 3];
      GroupArray.reverse({ array });
      expect(array).toEqual([1, 2, 3]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.reverse({} as any)).toThrow();
    });
  });

  describe('slice', () => {
    it('extracts a contiguous portion by start and end', () => {
      expect(GroupArray.slice({ array: ['a', 'b', 'c', 'd'], start: 1, end: 3 } as any)).toEqual([
        'b',
        'c',
      ]);
    });

    it('supports a negative start index', () => {
      expect(GroupArray.slice({ array: ['a', 'b', 'c'], start: -1 } as any)).toEqual(['c']);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.slice({ start: 0 } as any)).toThrow();
    });
  });

  describe('concat', () => {
    it('concatenates multiple arrays in order', () => {
      expect(GroupArray.concat({ arrays: [['a'], ['b', 'c']] })).toEqual(['a', 'b', 'c']);
    });

    it('throws when arrays is missing', () => {
      expect(() => GroupArray.concat({} as any)).toThrow();
    });
  });

  const invoices = [
    { id: 1, status: 'pending', amount: 120 },
    { id: 2, status: 'paid', amount: 80 },
    { id: 3, status: 'pending', amount: 500 },
  ];

  describe('find', () => {
    it('finds the first element matching a keyed condition', () => {
      expect(
        GroupArray.find({ array: invoices, key: 'amount', compareAs: 'number', operator: 'gt', value: 100 } as any)
      ).toEqual(invoices[0]);
    });

    it('compares the element itself when key is omitted', () => {
      expect(GroupArray.find({ array: [1, 2, 9, 3], compareAs: 'number', operator: 'gt', value: 5 } as any)).toBe(9);
    });

    it('returns null when nothing matches', () => {
      expect(
        GroupArray.find({ array: invoices, key: 'amount', compareAs: 'number', operator: 'gt', value: 9999 } as any)
      ).toBeNull();
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.find({ compareAs: 'number', operator: 'eq', value: 1 } as any)).toThrow();
    });
  });

  describe('filter', () => {
    it('keeps only the elements matching a keyed condition', () => {
      expect(
        GroupArray.filter({
          array: invoices,
          key: 'status',
          compareAs: 'string',
          operator: 'eq',
          value: 'pending',
        } as any)
      ).toEqual([invoices[0], invoices[2]]);
    });

    it('returns an empty array when nothing matches', () => {
      expect(
        GroupArray.filter({ array: invoices, key: 'status', compareAs: 'string', operator: 'eq', value: 'void' } as any)
      ).toEqual([]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.filter({ compareAs: 'number', operator: 'eq', value: 1 } as any)).toThrow();
    });
  });

  describe('some', () => {
    it('returns true when at least one element matches', () => {
      expect(
        GroupArray.some({ array: invoices, key: 'amount', compareAs: 'number', operator: 'gt', value: 400 } as any)
      ).toBe(true);
    });

    it('returns false when no element matches', () => {
      expect(
        GroupArray.some({ array: invoices, key: 'amount', compareAs: 'number', operator: 'gt', value: 4000 } as any)
      ).toBe(false);
    });

    it('returns false for an empty array', () => {
      expect(GroupArray.some({ array: [], compareAs: 'number', operator: 'eq', value: 1 } as any)).toBe(false);
    });
  });

  describe('every', () => {
    it('returns true when all elements match', () => {
      expect(
        GroupArray.every({ array: invoices, key: 'amount', compareAs: 'number', operator: 'gt', value: 0 } as any)
      ).toBe(true);
    });

    it('returns false when at least one element does not match', () => {
      expect(
        GroupArray.every({
          array: invoices,
          key: 'status',
          compareAs: 'string',
          operator: 'eq',
          value: 'pending',
        } as any)
      ).toBe(false);
    });

    it('returns true for an empty array (vacuous truth)', () => {
      expect(GroupArray.every({ array: [], compareAs: 'number', operator: 'eq', value: 1 } as any)).toBe(true);
    });
  });

  describe('count', () => {
    it('counts the elements matching a keyed condition', () => {
      expect(
        GroupArray.count({
          array: invoices,
          key: 'status',
          compareAs: 'string',
          operator: 'eq',
          value: 'pending',
        } as any)
      ).toBe(2);
    });

    it('returns 0 when nothing matches', () => {
      expect(
        GroupArray.count({ array: invoices, key: 'status', compareAs: 'string', operator: 'eq', value: 'void' } as any)
      ).toBe(0);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.count({ compareAs: 'number', operator: 'eq', value: 1 } as any)).toThrow();
    });
  });

  describe('typed conditions', () => {
    const rows = [
      { name: 'a', amount: '120' },
      { name: 'b', amount: 'n/a' },
      { name: 'c' },
      { name: 'd', amount: 80 },
    ];

    it('reads text amounts as numbers', () => {
      expect(
        GroupArray.filter({ array: rows, key: 'amount', compareAs: 'number', operator: 'gt', value: 100 } as any)
      ).toEqual([rows[0]]);
    });

    it('skips elements whose value is not a number instead of failing', () => {
      expect(
        GroupArray.count({ array: rows, key: 'amount', compareAs: 'number', operator: 'lt', value: 1000 } as any)
      ).toBe(2);
    });

    it('stops on a compare value that is not a number', () => {
      expect(() =>
        GroupArray.filter({ array: rows, key: 'amount', compareAs: 'number', operator: 'gt', value: 'lots' } as any)
      ).toThrow(/not a number/);
    });

    it('supports the other types, e.g. dates and ignoreCase', () => {
      const events = [{ on: '2026-01-05' }, { on: '2026-03-01' }];
      expect(
        GroupArray.filter({ array: events, key: 'on', compareAs: 'date', operator: 'after', value: '2026-02-01' } as any)
      ).toEqual([events[1]]);
      expect(
        GroupArray.some({ array: ['Urgent'], compareAs: 'string', operator: 'eq', value: 'urgent', ignoreCase: true } as any)
      ).toBe(true);
    });

    it('rejects an operator the type does not have', () => {
      expect(() =>
        GroupArray.filter({ array: rows, compareAs: 'number', operator: 'startsWith', value: '1' } as any)
      ).toThrow();
    });
  });

  describe('pluck', () => {
    it('extracts a top-level property from each element', () => {
      expect(GroupArray.pluck({ array: invoices, key: 'status' } as any)).toEqual([
        'pending',
        'paid',
        'pending',
      ]);
    });

    it('extracts a nested property using dot notation', () => {
      const rows = [{ address: { city: 'Austin' } }, { address: { city: 'Dallas' } }];
      expect(GroupArray.pluck({ array: rows, key: 'address.city' } as any)).toEqual([
        'Austin',
        'Dallas',
      ]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.pluck({ key: 'status' } as any)).toThrow();
    });
  });

  describe('groupBy', () => {
    it('groups elements into buckets keyed by a property value', () => {
      expect(GroupArray.groupBy({ array: invoices, key: 'status' } as any)).toEqual({
        pending: [invoices[0], invoices[2]],
        paid: [invoices[1]],
      });
    });

    it('throws when key is missing', () => {
      expect(() => GroupArray.groupBy({ array: invoices } as any)).toThrow();
    });
  });

  describe('keyBy', () => {
    it('indexes elements into an object keyed by a property value', () => {
      expect(GroupArray.keyBy({ array: invoices, key: 'id' } as any)).toEqual({
        1: invoices[0],
        2: invoices[1],
        3: invoices[2],
      });
    });

    it('lets the last element win on duplicate keys', () => {
      const rows = [
        { id: 1, name: 'first' },
        { id: 1, name: 'second' },
      ];
      expect(GroupArray.keyBy({ array: rows, key: 'id' } as any)).toEqual({
        1: { id: 1, name: 'second' },
      });
    });

    it('throws when key is missing', () => {
      expect(() => GroupArray.keyBy({ array: invoices } as any)).toThrow();
    });
  });

  describe('shuffle', () => {
    it('returns an array with the same elements in some order', () => {
      const array = [1, 2, 3, 4, 5];
      const result = GroupArray.shuffle({ array } as any);
      expect(result).toHaveLength(array.length);
      expect([...result].sort()).toEqual([...array].sort());
    });

    it('does not mutate the input array', () => {
      const array = [1, 2, 3, 4, 5];
      GroupArray.shuffle({ array } as any);
      expect(array).toEqual([1, 2, 3, 4, 5]);
    });

    it('returns an empty array unchanged', () => {
      expect(GroupArray.shuffle({ array: [] } as any)).toEqual([]);
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.shuffle({} as any)).toThrow();
    });
  });

  describe('sample', () => {
    it('returns one of the array elements', () => {
      const array = ['a', 'b', 'c'];
      expect(array).toContain(GroupArray.sample({ array } as any));
    });

    it('returns the only element for a single-element array', () => {
      expect(GroupArray.sample({ array: ['only'] } as any)).toBe('only');
    });

    it('returns null for an empty array', () => {
      expect(GroupArray.sample({ array: [] } as any)).toBeNull();
    });

    it('throws when array is missing', () => {
      expect(() => GroupArray.sample({} as any)).toThrow();
    });
  });
});

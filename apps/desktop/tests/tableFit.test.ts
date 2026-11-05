import { describe, expect, it } from 'vitest';
import {
  columnSizeStyle,
  columnWeight,
  FIT_COMFORT_COLUMN,
  FIT_MIN_COLUMN,
  fitLayout,
  type TableFitColumn,
} from '@/utils/tableFit';

const valueOf = (row: unknown, id: string) => (row as Record<string, unknown>)[id];
const col = (id: string, extra: Partial<TableFitColumn> = {}): TableFitColumn => ({ id, header: id, ...extra });

describe('columnWeight', () => {
  it('is the header or most of the values, within 4–40 characters', () => {
    expect(columnWeight(col('id'), [{ id: 1 }, { id: 22 }], valueOf)).toBe(4); // floor
    expect(columnWeight(col('description'), [{ description: 'short' }], valueOf)).toBe(11); // header
    expect(columnWeight(col('notes'), [{ notes: 'x'.repeat(30) }], valueOf)).toBe(30);
    expect(columnWeight(col('notes'), [{ notes: 'x'.repeat(500) }], valueOf)).toBe(40); // cap
  });

  it('one very long value does not set the width (90th percentile)', () => {
    const rows = [...Array.from({ length: 19 }, () => ({ name: 'Acme Corp' })), { name: 'x'.repeat(39) }];
    expect(columnWeight(col('name'), rows, valueOf)).toBe(9);
  });

  it('uses the column’s own measure (e.g. formatted values)', () => {
    const measure = (v: unknown) => (Array.isArray(v) ? v.join('').length + 3 * v.length : 0);
    expect(columnWeight(col('tags', { measure }), [{ tags: ['vip', 'billing'] }], valueOf)).toBe(16);
  });

  it('objects count as their JSON; empty values as nothing', () => {
    expect(columnWeight(col('a'), [{ a: { k: 'value' } }], valueOf)).toBe(13);
    expect(columnWeight(col('a'), [{ a: null }, {}], valueOf)).toBe(4);
  });
});

describe('fitLayout', () => {
  const rows = [
    {
      id: 'INV-1',
      amount: '$1,234.50', // 9 characters: 96px of content
      notes: 'A long note about this account and what happens with it next', // capped at 40: 344px
    },
  ];
  const px = (v: string | undefined) => parseFloat(v!);
  const columns = [col('__select', { width: 40 }), col('amount'), col('notes')];

  it('before the width is known: shares as percentages of the natural widths', () => {
    const { widths } = fitLayout(columns, rows, valueOf);
    expect(widths.__select).toBe('40px');
    expect(widths.amount!.endsWith('%')).toBe(true);
    expect(px(widths.amount) + px(widths.notes)).toBeCloseTo(100, 2);
  });

  it('room to spare: short values whole, long ones up to their content', () => {
    const { widths } = fitLayout(columns, rows, valueOf, 2000);
    expect(widths.amount).toBe('96px');
    expect(widths.notes).toBe('344px'); // the table's own width shares out the rest
  });

  it('a little room: short values stay whole, long ones get the rest', () => {
    const { widths } = fitLayout(columns, rows, valueOf, 40 + 96 + 200);
    expect(widths.amount).toBe('96px');
    expect(widths.notes).toBe('200px');
  });

  it('short of room: cut columns shrink to their minimum before whole ones shrink', () => {
    // 40 + 96 (amount) + 120 (notes, comfortable) don't fit in 220
    let { widths } = fitLayout(columns, rows, valueOf, 220);
    expect(widths.amount).toBe('96px');
    expect(widths.notes).toBe('84px');
    ({ widths } = fitLayout(columns, rows, valueOf, 40 + 56 + 76));
    expect(widths.notes).toBe(`${FIT_MIN_COLUMN}px`);
    expect(widths.amount).toBe('76px');
  });

  it('below the minimums every column keeps its minimum and the table scrolls', () => {
    const layout = fitLayout([...columns.slice(0, 2), col('notes', { minWidth: 200 })], rows, valueOf, 100);
    expect(layout.widths.amount).toBe(`${FIT_MIN_COLUMN}px`);
    expect(layout.widths.notes).toBe('200px');
    expect(layout.minWidth).toBe(40 + FIT_MIN_COLUMN + 200);
  });

  it('a minWidth past the comfortable width is kept when there is room', () => {
    const { widths } = fitLayout([col('id'), col('notes', { minWidth: 300 })], rows, valueOf, 1000);
    expect(px(widths.notes)).toBeGreaterThanOrEqual(300);
    expect(FIT_COMFORT_COLUMN).toBeLessThan(300);
  });

  it('only pixel columns: their sum', () => {
    expect(fitLayout([col('a', { width: 100 }), col('b', { width: 50 })], rows, valueOf, 800)).toEqual({
      widths: { a: '100px', b: '50px' },
      minWidth: 150,
    });
  });
});

describe('columnSizeStyle (scroll / wrap)', () => {
  it('width pins the column; minWidth only sets a floor', () => {
    expect(columnSizeStyle({ width: 80 })).toEqual({ width: '80px', minWidth: '80px', maxWidth: '80px' });
    expect(columnSizeStyle({ minWidth: 120 })).toEqual({ minWidth: '120px' });
    expect(columnSizeStyle({})).toEqual({});
    expect(columnSizeStyle(undefined)).toEqual({});
  });
});

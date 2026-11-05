import { describe, expect, it } from 'vitest';
import { formatValue, valueAt } from '@/utils/appFormat';

describe('appFormat', () => {
  it('formats numbers, money, percents and dates for the locale; leaves bad input as is', () => {
    expect(formatValue(1234.5, { format: 'number' }, 'en')).toBe('1,234.5');
    expect(formatValue(5, { format: 'currency', currency: 'EUR' }, 'en')).toBe('€5.00');
    expect(formatValue(0.256, { format: 'percent' }, 'en')).toBe('25.6%');
    expect(formatValue('2026-10-05T00:00:00', { format: 'date' }, 'en')).toBe('10/5/2026');
    expect(formatValue('soon', { format: 'date' }, 'en')).toBe('soon');
    // a date-only value is that calendar day wherever the user is (not shifted from UTC)
    expect(formatValue('2026-11-15', { format: 'date' }, 'en')).toBe('11/15/2026');
    expect(formatValue({ a: 1 }, {}, 'en')).toBe('{"a":1}');
    expect(formatValue(null, { format: 'number' }, 'en')).toBe('');
  });

  it('reads dotted paths, preferring a key that contains the dot itself', () => {
    const data = { a: { b: { c: 3 } }, 'x.y': 'flat' };
    expect(valueAt(data, 'a.b.c')).toBe(3);
    expect(valueAt(data, 'x.y')).toBe('flat');
    expect(valueAt(data, 'a.zz.c')).toBeUndefined();
    expect(valueAt(null, 'a')).toBeUndefined();
  });
});

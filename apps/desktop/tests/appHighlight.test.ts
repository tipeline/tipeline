import { describe, expect, it } from 'vitest';
import { highlightColor } from '@/utils/appHighlight';

describe('highlightColor', () => {
  const rules = [
    { compareAs: 'string', operator: 'empty', color: 'gray' },
    { compareAs: 'number', operator: 'lt', value: 0, color: 'red' },
    { compareAs: 'number', operator: 'gte', value: 1000, color: 'green' },
    { compareAs: 'string', operator: 'eq', value: 'Overdue', ignoreCase: true, color: 'red' },
    { compareAs: 'string', operator: 'contains', value: 'vip', ignoreCase: true, color: 'purple' },
  ];

  it('compares numbers as numbers (also numeric strings)', () => {
    expect(highlightColor(-5, rules)).toBe('red');
    expect(highlightColor('1200', rules)).toBe('green');
    expect(highlightColor(999, rules)).toBeNull();
    expect(highlightColor(1000, [{ compareAs: 'number', operator: 'gt', value: '999.5', color: 'blue' }])).toBe('blue');
  });

  it('compares text, ignoring case when the rule says so; empty and contains', () => {
    expect(highlightColor('overdue', rules)).toBe('red');
    expect(highlightColor('Acme VIP', rules)).toBe('purple');
    expect(highlightColor('', rules)).toBe('gray');
    expect(highlightColor(null, [{ compareAs: 'string', operator: 'notEmpty', color: 'blue' }])).toBeNull();
    expect(highlightColor('Overdue', [{ compareAs: 'string', operator: 'eq', value: 'overdue', color: 'red' }])).toBeNull();
  });

  it('the first matching rule wins; no rules, no color', () => {
    expect(highlightColor(-1, [{ compareAs: 'number', operator: 'lt', value: 10, color: 'amber' }, ...rules])).toBe('amber');
    expect(highlightColor(5, undefined)).toBeNull();
  });

  it('compares dates', () => {
    const due = [{ compareAs: 'date', operator: 'before', value: '2026-10-01', color: 'red' }];
    expect(highlightColor('2026-09-30', due)).toBe('red');
    expect(highlightColor('2026-10-02', due)).toBeNull();
  });
});

describe('highlightColor: values that do not fit the rule', () => {
  it('a cell that cannot be read as the rule\'s type does not match (and does not throw)', () => {
    expect(highlightColor('overdue', [{ compareAs: 'number', operator: 'gte', value: 1000, color: 'green' }])).toBeNull();
    expect(highlightColor(5, [{ compareAs: 'number', operator: 'lt', value: 'm', color: 'red' }])).toBeNull();
    expect(highlightColor(10, [{ compareAs: 'string', operator: 'eq', value: '10', color: 'amber' }])).toBe('amber');
  });

  it('a rule whose operator does not fit its type never matches', () => {
    expect(highlightColor('b', [{ compareAs: 'string', operator: 'gt', value: 'a', color: 'blue' }])).toBeNull();
  });
});

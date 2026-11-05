import { describe, it, expect } from 'vitest';
import { upgradeHighlightRule } from '../src/legacyColorRules';

describe('upgradeHighlightRule', () => {
  it('maps symbols and infers the type', () => {
    expect(upgradeHighlightRule({ when: '>', value: 1000, color: 'green' })).toEqual({
      compareAs: 'number',
      operator: 'gt',
      value: 1000,
      color: 'green',
    });
    expect(upgradeHighlightRule({ when: '<', value: '2026-01-01', color: 'red' })).toEqual({
      compareAs: 'date',
      operator: 'before',
      value: '2026-01-01',
      color: 'red',
    });
  });

  it('keeps text comparisons case-insensitive, as they were', () => {
    expect(upgradeHighlightRule({ when: '=', value: 'overdue', color: 'red' })).toEqual({
      compareAs: 'string',
      operator: 'eq',
      ignoreCase: true,
      value: 'overdue',
      color: 'red',
    });
    expect(upgradeHighlightRule({ when: 'contains', value: 'late', color: 'amber' })).toMatchObject({
      compareAs: 'string',
      operator: 'contains',
      ignoreCase: true,
    });
  });

  it('maps empty / notEmpty', () => {
    expect(upgradeHighlightRule({ when: 'empty', color: 'gray' })).toEqual({ compareAs: 'string', operator: 'empty', color: 'gray' });
  });

  it('leaves new-format rules alone', () => {
    const rule = { compareAs: 'number', operator: 'gt', value: 1, color: 'green' };
    expect(upgradeHighlightRule(rule)).toBe(rule);
  });
});

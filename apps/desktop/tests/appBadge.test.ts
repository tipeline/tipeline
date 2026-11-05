import { describe, expect, it } from 'vitest';
import { badgeColor, badgeValues } from '@/utils/appBadge';

describe('badgeColor', () => {
  it('uses the colors given (any case), then defaultColor', () => {
    expect(badgeColor('active', { active: 'purple' })).toBe('purple');
    expect(badgeColor('Active', { active: 'purple' })).toBe('purple');
    expect(badgeColor('vip', { gold: 'amber' }, 'blue')).toBe('blue');
    expect(badgeColor('x', { x: 'pink' })).not.toBe('pink'); // not a color: ignored
  });

  it('gives common status words the color people expect', () => {
    expect(['active', 'Approved', 'done'].map((v) => badgeColor(v))).toEqual(['green', 'green', 'green']);
    expect(['pending', 'Waiting', 'in review'].map((v) => badgeColor(v))).toEqual(['amber', 'amber', 'amber']);
    expect(['failed', 'error', 'rejected'].map((v) => badgeColor(v))).toEqual(['red', 'red', 'red']);
    expect(['closed', 'archived'].map((v) => badgeColor(v))).toEqual(['gray', 'gray']);
    expect(badgeColor('in-progress')).toBe('blue');
  });

  it('any other value gets a stable color of its own (never gray)', () => {
    expect(badgeColor('billing')).toBe(badgeColor('billing'));
    expect(['billing', 'urgent', 'design', 'ops'].map((v) => badgeColor(v))).not.toContain('gray');
    expect(badgeColor('')).toBe('gray');
  });

  it('a list is several badges; empty is none', () => {
    expect(badgeValues(['urgent', 'billing', '', null])).toEqual(['urgent', 'billing']);
    expect(badgeValues(42)).toEqual(['42']);
    expect(badgeValues(null)).toEqual([]);
  });
});

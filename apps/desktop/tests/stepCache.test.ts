import { describe, expect, it } from 'vitest';
import { hasStepCache } from '@/utils/stepCache';

describe('hasStepCache', () => {
  it('finds a cached step at any depth', () => {
    expect(hasStepCache([{ group: 'math', name: 'sum', cache: { ttl: '1h' } }])).toBe(true);
    expect(
      hasStepCache([{ group: 'flow', name: 'forEachLoop', params: { actions: [{ cache: { ttl: 60 } }] } }])
    ).toBe(true);
    expect(
      hasStepCache([
        { group: 'flow', name: 'ifConditional', params: { statements: [{ actions: [{ cache: { ttl: '5m' } }] }] } },
      ])
    ).toBe(true);
  });

  it('is false without cached steps', () => {
    expect(hasStepCache([{ group: 'math', name: 'sum' }])).toBe(false);
    expect(hasStepCache([])).toBe(false);
    expect(hasStepCache(undefined)).toBe(false);
  });
});

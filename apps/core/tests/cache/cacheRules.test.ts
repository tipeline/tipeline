import { describe, expect, it } from 'vitest';
import {
  isCacheableAction,
  isCacheableCall,
  parseTtl,
  uncacheableSteps,
  MAX_CACHE_TTL_SECONDS,
  stepCacheSchema,
} from '@tipeline/schemas';

describe('parseTtl', () => {
  it('reads seconds and the s/m/h/d units', () => {
    expect(parseTtl(90)).toBe(90);
    expect(parseTtl('90')).toBe(90);
    expect(parseTtl('30s')).toBe(30);
    expect(parseTtl('15m')).toBe(900);
    expect(parseTtl('1h')).toBe(3600);
    expect(parseTtl('2d')).toBe(172800);
  });

  it('rejects zero, negatives, fractions and other words', () => {
    for (const bad of [0, -5, 1.5, '0m', '1w', 'soon', '', null, undefined, {}]) {
      expect(parseTtl(bad)).toBeNull();
    }
  });

  it('caps the TTL at a month in the schema', () => {
    expect(stepCacheSchema.safeParse({ ttl: '30d' }).success).toBe(true);
    expect(stepCacheSchema.safeParse({ ttl: MAX_CACHE_TTL_SECONDS + 1 }).success).toBe(false);
    expect(stepCacheSchema.safeParse({ ttl: '1h', extra: true }).success).toBe(false);
  });
});

describe('which steps can be cached', () => {
  it('allows reads and pure transforms, never side effects, handles, clock or randomness', () => {
    expect(isCacheableAction('math', 'sum')).toBe(true);
    expect(isCacheableAction('ai', 'prompt')).toBe(true);
    expect(isCacheableAction('file', 'read')).toBe(true);
    expect(isCacheableAction('script', 'runScript')).toBe(true);
    for (const [group, name] of [
      ['email', 'send'],
      ['file', 'write'],
      ['browser', 'goTo'],
      ['database', 'connect'],
      ['approval', 'request'],
      ['variable', 'set'],
      ['subtask', 'exec'],
      ['math', 'random'],
      ['array', 'shuffle'],
      ['datetime', 'nowISO'],
      ['nope', 'nothing'],
    ]) {
      expect(isCacheableAction(group, name)).toBe(false);
    }
  });

  it('decides per call for requests and queries', () => {
    expect(isCacheableCall('http', 'request', {})).toBe(true);
    expect(isCacheableCall('http', 'request', { method: 'GET' })).toBe(true);
    expect(isCacheableCall('http', 'request', { method: 'post' })).toBe(false);
    expect(isCacheableCall('api', 'request', { method: 'DELETE' })).toBe(false);
    expect(isCacheableCall('database', 'query', { sql: '  select * from t' })).toBe(true);
    expect(isCacheableCall('database', 'query', { sql: 'WITH x AS (select 1) select * from x' })).toBe(true);
    expect(isCacheableCall('database', 'query', { sql: 'update t set a = 1' })).toBe(false);
  });
});

describe('uncacheableSteps', () => {
  it('lists the steps that stop a workflow from being cached, nested ones included', () => {
    const actions = [
      { group: 'script', name: 'runScript', params: {} },
      { group: 'variable', name: 'set', params: { name: 'people' } },
      {
        group: 'flow',
        name: 'ifConditional',
        params: { statements: [{ actions: [{ group: 'email', name: 'send', params: {} }] }] },
      },
      { group: 'flow', name: 'forEachLoop', params: { actions: [{ group: 'file', name: 'write', params: {} }] } },
      { group: 'email', name: 'send', params: {}, disabled: true },
    ];
    expect(uncacheableSteps(actions)).toEqual(['email.send', 'file.write']);
  });

  it('treats writing a global variable as a side effect', () => {
    expect(
      uncacheableSteps([
        { group: 'variable', name: 'set', params: { name: '_global.count' } },
        { group: 'math', name: 'sum', params: {}, destination: '_global.total' },
      ])
    ).toEqual(['variable.set (writes a global variable)', 'math.sum (writes a global variable)']);
  });

  it('allows a plugin step only when the plugin says so', () => {
    const actions = [{ group: 'drupal', name: 'get', source: 'plugin', params: {} }];
    expect(uncacheableSteps(actions)).toEqual(['drupal.get']);
    expect(uncacheableSteps(actions, (g, n) => g === 'drupal' && n === 'get')).toEqual([]);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { canonicalJson, stepCacheKey, workflowCacheKey } from '@/cache/CacheKey';
import { PluginCacheableRegistry } from '@/plugin/PluginCacheableRegistry';

const sum = { group: 'math', name: 'sum' };

describe('stepCacheKey', () => {
  it('gives equal params the same key whatever their key order', () => {
    expect(stepCacheKey(sum, { a: 2, b: { x: 1, y: 2 } })).toBe(stepCacheKey(sum, { b: { y: 2, x: 1 }, a: 2 }));
    expect(stepCacheKey(sum, { a: 2 })).not.toBe(stepCacheKey(sum, { a: 3 }));
  });

  it('keeps actions apart', () => {
    expect(stepCacheKey(sum, { numbers: [1] })).not.toBe(
      stepCacheKey({ group: 'math', name: 'max' }, { numbers: [1] })
    );
  });

  it('is null for a step that cannot be cached, or a call that only sometimes can', () => {
    expect(stepCacheKey({ group: 'email', name: 'send' }, {})).toBeNull();
    expect(stepCacheKey({ group: 'http', name: 'request' }, { url: 'https://x', method: 'post' })).toBeNull();
    expect(stepCacheKey({ group: 'http', name: 'request' }, { url: 'https://x' })).not.toBeNull();
  });

  it('is null when a param is a live handle, instead of hashing it as empty', () => {
    class Handle {}
    expect(stepCacheKey(sum, { a: new Handle() })).toBeNull();
    expect(stepCacheKey(sum, { a: () => 1 })).toBeNull();
    expect(stepCacheKey(sum, { a: Buffer.from('x') })).toBeNull();
  });

  it('tells database connections apart by where they point, never their password', () => {
    const knex = (database: string, password: string) =>
      Object.assign(() => {}, {
        client: { config: { client: 'pg', connection: { host: 'db', database, user: 'u', password } } },
      });
    const query = { group: 'database', name: 'query' };
    const a = stepCacheKey(query, { connection: knex('sales', 'p1'), sql: 'select 1' });
    expect(a).not.toBeNull();
    expect(a).not.toBe(stepCacheKey(query, { connection: knex('hr', 'p1'), sql: 'select 1' }));
    expect(a).toBe(stepCacheKey(query, { connection: knex('sales', 'p2'), sql: 'select 1' }));
  });

  it('only uses the chosen params when `key` is set', () => {
    const http = { group: 'http', name: 'request' };
    expect(stepCacheKey(http, { url: 'https://x', timeout: 1 }, ['url'])).toBe(
      stepCacheKey(http, { url: 'https://x', timeout: 9 }, ['url'])
    );
  });

  describe('files', () => {
    let dir = '';
    afterEach(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('misses once a file it read has changed', () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-cache-'));
      const file = path.join(dir, 'a.txt');
      fs.writeFileSync(file, 'one');
      fs.utimesSync(file, new Date(1_000_000), new Date(1_000_000));
      const read = { group: 'file', name: 'read' };
      const before = stepCacheKey(read, { path: file });
      expect(stepCacheKey(read, { path: file })).toBe(before);
      fs.writeFileSync(file, 'two, longer');
      expect(stepCacheKey(read, { path: file })).not.toBe(before);
    });
  });

  describe('plugins', () => {
    afterEach(() => {
      delete PluginCacheableRegistry.weather;
    });

    it('caches only the actions a plugin lists, keyed by its version', () => {
      const forecast = { group: 'weather', name: 'forecast', source: 'plugin' as const };
      expect(stepCacheKey(forecast, { city: 'Lima' })).toBeNull();
      PluginCacheableRegistry.weather = { version: '1.0.0', actions: ['forecast'] };
      const v1 = stepCacheKey(forecast, { city: 'Lima' });
      expect(v1).not.toBeNull();
      PluginCacheableRegistry.weather = { version: '1.1.0', actions: ['forecast'] };
      expect(stepCacheKey(forecast, { city: 'Lima' })).not.toBe(v1);
    });
  });
});

describe('workflowCacheKey', () => {
  const base = {
    identifier: 'wf',
    source: { name: 'W', pipeline: { actions: [] } },
    inputs: { team: 'a' },
    outsideValues: {},
    outputs: ['people', 'projects'],
  };

  it('changes with the workflow source, the inputs, outside values and the outputs asked for', () => {
    const key = workflowCacheKey(base);
    expect(workflowCacheKey({ ...base, outputs: ['projects', 'people'] })).toBe(key);
    expect(workflowCacheKey({ ...base, source: { ...base.source, name: 'W2' } })).not.toBe(key);
    expect(workflowCacheKey({ ...base, inputs: { team: 'b' } })).not.toBe(key);
    expect(workflowCacheKey({ ...base, outsideValues: { region: 'eu' } })).not.toBe(key);
    expect(workflowCacheKey({ ...base, outputs: ['people'] })).not.toBe(key);
  });
});

describe('canonicalJson', () => {
  it('is null for anything that is not plain data', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(canonicalJson({ a: new Map() })).toBeNull();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => {
  const nodeFs = require('fs') as typeof import('fs');
  const nodeOs = require('os') as typeof import('os');
  const nodePath = require('path') as typeof import('path');
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'cache-env-home-'));
});
vi.mock('os', async (original) => {
  const actual = await original<any>();
  const mocked = { ...actual, homedir: () => home };
  return { ...mocked, default: mocked };
});
vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getByName: vi.fn(async () => null) },
}));
vi.mock('@database/services/CacheService', () => ({ CacheService: {} }));

import { WorkflowCache, resolveEnvValue } from '@/cache/WorkflowCache';

// What a run reads: ~/.tipeline/.env (TaskFactory.loadEnvFiles). The cache has to read the same file.
const envFile = path.join(home, '.tipeline', '.env');
const writeEnv = (text: string) => {
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(envFile, text);
};

const call = (pipeline: unknown) => ({
  identifier: 'wf',
  name: 'Workflow',
  source: { name: 'Workflow', cache: { ttl: '1h' }, pipeline },
  inputs: {},
  outputs: ['out'],
});

describe('the workflow cache and the environment file', () => {
  beforeEach(() => {
    delete process.env.CACHE_ENV_TEST_KEY;
  });
  afterEach(() => {
    fs.rmSync(path.join(home, '.tipeline'), { recursive: true, force: true });
    fs.rmSync(path.join(home, 'Tipeline'), { recursive: true, force: true });
  });

  it('reads ~/.tipeline/.env, the file runs read', () => {
    writeEnv('CACHE_ENV_TEST_KEY=from-dot-tipeline\n');
    expect(resolveEnvValue('CACHE_ENV_TEST_KEY')).toBe('from-dot-tipeline');
  });

  it('does not read ~/Tipeline/.env', () => {
    fs.mkdirSync(path.join(home, 'Tipeline'), { recursive: true });
    fs.writeFileSync(path.join(home, 'Tipeline', '.env'), 'CACHE_ENV_TEST_KEY=wrong-file\n');
    expect(resolveEnvValue('CACHE_ENV_TEST_KEY')).toBeUndefined();
  });

  it("prefers Core's own environment, like a run does", () => {
    writeEnv('CACHE_ENV_TEST_KEY=from-file\n');
    process.env.CACHE_ENV_TEST_KEY = 'from-process';
    expect(resolveEnvValue('CACHE_ENV_TEST_KEY')).toBe('from-process');
  });

  it('starts fresh when a valueFromEnv value changes in the file', async () => {
    const pipeline = {
      variables: [{ name: 'apiKey', type: 'string', valueFromEnv: 'CACHE_ENV_TEST_KEY' }],
      actions: [],
    };
    writeEnv('CACHE_ENV_TEST_KEY=one\n');
    const first = await WorkflowCache.prepare(call(pipeline));
    writeEnv('CACHE_ENV_TEST_KEY=two\n');
    const second = await WorkflowCache.prepare(call(pipeline));
    expect(first?.key).toBeTruthy();
    expect(second?.key).not.toBe(first?.key);
  });

  it('starts fresh when a value a step reads with {{ _env.KEY }} changes', async () => {
    const pipeline = {
      variables: [],
      actions: [
        { group: 'system', name: 'message', params: { text: 'Key: {{ _env.CACHE_ENV_TEST_KEY }}' } },
      ],
    };
    writeEnv('CACHE_ENV_TEST_KEY=one\n');
    const first = await WorkflowCache.prepare(call(pipeline));
    const same = await WorkflowCache.prepare(call(pipeline));
    writeEnv('CACHE_ENV_TEST_KEY=two\n');
    const second = await WorkflowCache.prepare(call(pipeline));
    expect(same?.key).toBe(first?.key);
    expect(second?.key).not.toBe(first?.key);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => {
  const nodeFs = require('fs') as typeof import('fs');
  const nodeOs = require('os') as typeof import('os');
  const nodePath = require('path') as typeof import('path');
  return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'sweep-home-'));
});
vi.mock('node:os', async (original) => {
  const actual = await original<any>();
  const mocked = { ...actual, homedir: () => home };
  return { ...mocked, default: mocked };
});

import { sealExistingSecrets } from '@database/services/SecretSweep';
import { ConnectionService } from '@database/services/ConnectionService';
import { HubService } from '@database/services/HubService';
import { SettingsService } from '@database/services/SettingsService';
import { isSealed, openCredential, unseal } from '@utils/secretBox';

// Against a real (in-memory) SQLite with the real migrations, holding what older versions wrote.
let knex: Knex;

const source = JSON.stringify({
  name: 'wf',
  pipeline: {
    variables: [
      { name: 'pw', type: 'string', value: 'hunter2', secret: true },
      { name: 'fromGlobal', type: 'string', valueFromGlobal: 'apiKey' },
      { name: 'copy', type: 'string', value: '' },
      { name: 'open', type: 'string', value: 'hello' },
    ],
    actions: [],
  },
});

async function run(status: string) {
  const [taskId] = await knex('task').insert({ identifier: `t-${status}`, name: status, source });
  const [id] = await knex('pipeline').insert({
    identifier: `p-${status}`,
    task_id: taskId,
    status,
    source,
    started_at: new Date().toISOString(),
  });
  const row = (name: string, value: string, scope = 'task') => ({
    pipeline_id: id,
    name,
    value: JSON.stringify(value),
    type: 'string',
    scope,
  });
  await knex('pipeline_variable').insert([
    row('pw', 'hunter2'),
    row('fromGlobal', 'global-secret'),
    row('copy', 'pw is hunter2'),
    row('open', 'hello'),
    row('fromEnv', 'env-secret', 'env'),
  ]);
  return id;
}

const valueOf = async (pipeline_id: number, name: string) =>
  (await knex('pipeline_variable').where({ pipeline_id, name }).whereNull('block_id').first()).value;

describe('sealExistingSecrets', () => {
  let completed: number;
  let failed: number;

  beforeAll(async () => {
    knex = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      pool: { min: 1, max: 1 },
      migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
    });
    await knex.migrate.latest();
    Model.knex(knex);
    await knex('global_variable').insert([
      { identifier: 'g-1', name: 'apiKey', type: 'string', value: JSON.stringify('global-secret'), secret: true },
      { identifier: 'g-2', name: 'region', type: 'string', value: JSON.stringify('eu'), secret: false },
    ]);
    completed = await run('completed');
    failed = await run('failed');
    await knex('settings').insert([
      { key: 'agent_openai_api_key', value: 'sk-plain' },
      { key: 'agent_gemini_api_key', value: '' },
      { key: 'api_token', value: 'core-plain' },
      { key: 'timezone', value: 'UTC' },
    ]);
    await knex('hub').insert({ id: 'h-1', name: 'Team', type: 'remote', target: 'https://x.test', token: 'hub-plain', enabled: true });
    await knex('hub').insert({ id: 'h-2', name: 'Open', type: 'local_folder', target: '/tmp', token: null, enabled: true });
    await knex('connections').insert({ id: 'c-1', name: 'Prod', host: 'ws://x.test', token: 'remote-plain' });
    fs.mkdirSync(path.join(home, '.tipeline', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(home, '.tipeline', 'logs', 'start.log'), 'x Tipeline Core API token: abc123\nother line\n');
    await sealExistingSecrets();
  });

  afterAll(async () => {
    await knex.destroy();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('seals global secrets and leaves the rest', async () => {
    const stored = await knex('global_variable').orderBy('name').select('name', 'value');
    expect(isSealed(stored[0].value)).toBe(true);
    expect(unseal(stored[0].value)).toBe(JSON.stringify('global-secret'));
    expect(stored[1].value).toBe(JSON.stringify('eu'));
  });

  it('forgets the secrets of a completed run, copies included', async () => {
    for (const name of ['pw', 'fromGlobal', 'copy', 'fromEnv']) {
      expect(await valueOf(completed, name)).toBe('null');
    }
    expect(await valueOf(completed, 'open')).toBe(JSON.stringify('hello'));
  });

  it('keeps them sealed on a run that can still resume', async () => {
    const pw = await valueOf(failed, 'pw');
    expect(isSealed(pw)).toBe(true);
    expect(unseal(pw)).toBe(JSON.stringify('hunter2'));
    expect(isSealed(await valueOf(failed, 'copy'))).toBe(true);
    expect(isSealed(await valueOf(failed, 'fromEnv'))).toBe(true);
    expect(await valueOf(failed, 'open')).toBe(JSON.stringify('hello'));
  });

  it("takes written-in values out of the runs' snapshots", async () => {
    const rows = await knex('pipeline').select('source');
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.source).not.toContain('hunter2');
  });

  it('removes the token from old logs', () => {
    const log = fs.readFileSync(path.join(home, '.tipeline', 'logs', 'start.log'), 'utf8');
    expect(log).not.toContain('abc123');
    expect(log).toContain('other line');
  });

  describe('credentials', () => {
    const setting = async (key: string) => (await knex('settings').where({ key }).first()).value;

    it('encrypts them where they are stored, and leaves the rest', async () => {
      expect(isSealed(await setting('agent_openai_api_key'))).toBe(true);
      expect(isSealed(await setting('api_token'))).toBe(true);
      expect(await setting('agent_gemini_api_key')).toBe('');
      expect(await setting('timezone')).toBe('UTC');
      expect(isSealed((await knex('hub').where({ id: 'h-1' }).first()).token)).toBe(true);
      expect((await knex('hub').where({ id: 'h-2' }).first()).token).toBeNull();
      expect(isSealed((await knex('connections').first()).token)).toBe(true);
    });

    it('still reads them as plain text', async () => {
      expect(await SettingsService.get('agent_openai_api_key')).toBe('sk-plain');
      expect(await SettingsService.getOrCreateToken()).toBe('core-plain');
      expect((await SettingsService.getAll()).agent_openai_api_key).toBe('sk-plain');
      expect((await HubService.getById('h-1'))?.token).toBe('hub-plain');
      expect((await HubService.getById('h-2'))?.token).toBeNull();
      expect((await ConnectionService.list())[0].token).toBe('remote-plain');
    });

    it('encrypts what is saved from now on, wherever it comes from', async () => {
      await SettingsService.set('agent_anthropic_api_key', 'sk-new');
      expect(isSealed(await setting('agent_anthropic_api_key'))).toBe(true);
      expect(await SettingsService.get('agent_anthropic_api_key')).toBe('sk-new');

      const hub = await HubService.update('h-2', { token: 'hub-new' });
      expect(hub.token).toBe('hub-new');
      expect(isSealed((await knex('hub').where({ id: 'h-2' }).first()).token)).toBe(true);
      await HubService.update('h-2', { token: null });
      expect((await knex('hub').where({ id: 'h-2' }).first()).token).toBeNull();

      const added = await ConnectionService.add('New', 'ws://y.test', 'remote-new');
      expect(added.token).toBe('remote-new');
      expect(isSealed((await knex('connections').where({ id: added.id }).first()).token)).toBe(true);
      expect((await ConnectionService.update(added.id, { name: 'Renamed' })).token).toBe('remote-new');
      await ConnectionService.remove(added.id);
    });

    it('treats a credential it cannot read as not set', () => {
      expect(openCredential('enc:v1:AAAA')).toBeNull();
      expect(openCredential('plain-from-before')).toBe('plain-from-before');
    });
  });

  it('runs only once', async () => {
    await knex('global_variable').where({ name: 'apiKey' }).update({ value: JSON.stringify('written-later') });
    await sealExistingSecrets();
    expect((await knex('global_variable').where({ name: 'apiKey' }).first()).value).toBe(JSON.stringify('written-later'));
  });
});

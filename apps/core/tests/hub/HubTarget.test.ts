import fs from 'fs';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { home } = vi.hoisted(() => ({ home: `${process.env.TMPDIR ?? '/tmp'}/tipeline-hub-target-${process.pid}` }));

vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, homedir: () => home, default: { ...actual, homedir: () => home } };
});
vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>();
  return { ...actual, homedir: () => home, default: { ...actual, homedir: () => home } };
});

import { HubService } from '@database/services/HubService';

let knex: Knex;

beforeAll(async () => {
  fs.mkdirSync(path.join(home, 'Tipeline', 'hub'), { recursive: true });
  fs.mkdirSync(path.join(home, 'other-hub'), { recursive: true });
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(async () => {
  await knex.destroy();
  fs.rmSync(home, { recursive: true, force: true });
});

describe('hub targets', () => {
  it('saves a "~/…" local folder as the full path', async () => {
    const hub = await HubService.add({ name: 'Mine', type: 'local_folder', target: ' ~/Tipeline/hub ' });
    expect(hub.target).toBe(path.join(home, 'Tipeline', 'hub'));
  });

  it('expands "~/…" when a local folder hub is edited', async () => {
    const hub = await HubService.add({ name: 'Edit me', type: 'local_folder', target: path.join(home, 'Tipeline', 'hub') });
    const updated = await HubService.update(hub.id, { target: '~/other-hub' });
    expect(updated.target).toBe(path.join(home, 'other-hub'));
  });

  it('still rejects a relative folder and a missing one', async () => {
    await expect(HubService.add({ name: 'Rel', type: 'local_folder', target: 'hub' })).rejects.toThrow(/absolute/);
    await expect(HubService.add({ name: 'Gone', type: 'local_folder', target: '~/missing' })).rejects.toThrow(/Folder not found/);
  });

  it('leaves a remote address alone apart from spaces', async () => {
    const hub = await HubService.add({ name: 'Web', type: 'remote', target: ' https://example.com/~/hub.json ' });
    expect(hub.target).toBe('https://example.com/~/hub.json');
  });
});

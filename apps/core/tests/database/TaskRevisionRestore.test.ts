import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import Core from '@engine/Core';
import { TaskService } from '@database/services/TaskService';

// Restoring goes through Core: the old version is checked like a builder save and
// saved as a new version.
let knex: Knex;

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(() => knex.destroy());

const source = (message: string) =>
  JSON.stringify({ name: 'Flow', description: 'Test', pipeline: { variables: [], actions: [{ group: 'math', name: 'sum', params: { message } }] } });

describe('Core.taskRevisionRestore', () => {
  it('puts an old version back as a new version, keeping the one it replaced', async () => {
    const task = await TaskService.install({ name: 'Flow', source: source('first') });
    await Core.taskUpdateSource(task.identifier, source('second'));
    const [, created] = await Core.taskRevisionList(task.identifier);

    const restored = await Core.taskRevisionRestore(task.identifier, created.id);
    expect(JSON.parse(restored!.source!).pipeline.actions[0].params.message).toBe('first');

    const list = await Core.taskRevisionList(task.identifier);
    expect(list.map((r) => r.origin)).toEqual(['restore', 'edit', 'created']);
    expect(list[0]).toMatchObject({ restoredFrom: created.id, current: true });
  });

  it('refuses a version whose steps no longer exist', async () => {
    const task = await TaskService.install({ name: 'Gone', source: source('ok') });
    const [id] = await knex('task_revision').insert({
      task_id: task.id,
      source: JSON.stringify({ name: 'Gone', description: 'Test', pipeline: { variables: [], actions: [{ group: 'nope', name: 'missing' }] } }),
      origin: 'edit',
      created_at: '2026-10-01T00:00:00.000Z',
    });
    await expect(Core.taskRevisionRestore(task.identifier, id)).rejects.toThrow(/validationFailed/);
  });

  it("won't read another workflow's version", async () => {
    const a = await TaskService.install({ name: 'A', source: source('a') });
    const b = await TaskService.install({ name: 'B', source: source('b') });
    const [revision] = await Core.taskRevisionList(a.identifier);
    await expect(Core.taskRevisionDetail(b.identifier, revision.id)).rejects.toThrow(/Version not found/);
  });
});

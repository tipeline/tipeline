import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

// Against a real (in-memory) SQLite with the real migrations, like cancelIdle.
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

beforeEach(async () => {
  await knex('pipeline').del();
  await knex('task').del();
  const [taskId] = await knex('task').insert({ identifier: 't-1', name: 'T', source: '{}' });
  const run = { task_id: taskId, source: '{}' };
  await knex('pipeline').insert([
    { ...run, identifier: 'p-done', status: 'completed' },
    { ...run, identifier: 'p-failed', status: 'failed' },
    { ...run, identifier: 'p-running', status: 'running' },
    { ...run, identifier: 'p-other', status: 'completed' },
  ]);
});

const left = async () => (await knex('pipeline').orderBy('identifier').pluck('identifier')) as string[];

describe('PipelineService.deleteByIdentifiers', () => {
  it('deletes only the named runs and returns them', async () => {
    const deleted = await PipelineService.deleteByIdentifiers(['p-done', 'p-failed']);

    expect(deleted.sort()).toEqual(['p-done', 'p-failed']);
    expect(await left()).toEqual(['p-other', 'p-running']);
  });

  it('skips a run that is still running, like Clear history', async () => {
    const deleted = await PipelineService.deleteByIdentifiers(['p-done', 'p-running']);

    expect(deleted).toEqual(['p-done']);
    expect(await left()).toContain('p-running');
  });

  it('ignores unknown identifiers and an empty list', async () => {
    expect(await PipelineService.deleteByIdentifiers([])).toEqual([]);
    expect(await PipelineService.deleteByIdentifiers(['nope'])).toEqual([]);
    expect(await left()).toHaveLength(4);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

// Against a real (in-memory) SQLite: started_at is an ISO instant compared as text,
// which is exactly what the bounds have to get right.
let knex: Knex;
let taskId: number;

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
  [taskId] = await knex('task').insert({ identifier: 't-1', name: 'T', source: '{}' });
  const run = (identifier: string, started_at: string) => ({ identifier, task_id: taskId, source: '{}', status: 'completed', started_at });
  await knex('pipeline').insert([
    run('sep30-late', '2026-09-30T23:59:59.000Z'),
    run('oct1-early', '2026-10-01T00:00:00.000Z'),
    run('oct5-noon', '2026-10-05T12:00:00.000Z'),
    run('oct5-late', '2026-10-05T23:59:59.500Z'),
    run('oct6-early', '2026-10-06T00:00:00.000Z'),
  ]);
});

const ids = (rows: any[]) => rows.map((r) => r.identifier).sort();

describe('PipelineService.getFilteredByTask: dateRange', () => {
  it('a date-only "to" includes its whole day (it used to stop at midnight)', async () => {
    const rows = await PipelineService.getFilteredByTask(taskId, 'dateRange', { dateFrom: '2026-10-01', dateTo: '2026-10-05' });
    expect(ids(rows)).toEqual(['oct1-early', 'oct5-late', 'oct5-noon']);
  });

  it('exact instants (what apps send for the user’s timezone) are used as they are', async () => {
    const rows = await PipelineService.getFilteredByTask(taskId, 'dateRange', {
      dateFrom: '2026-10-05T06:00:00.000Z',
      dateTo: '2026-10-06T05:59:59.999Z',
    });
    expect(ids(rows)).toEqual(['oct5-late', 'oct5-noon', 'oct6-early']);
  });

  it('either end can be open', async () => {
    expect(ids(await PipelineService.getFilteredByTask(taskId, 'dateRange', { dateTo: '2026-09-30' }))).toEqual(['sep30-late']);
    expect(ids(await PipelineService.getFilteredByTask(taskId, 'dateRange', { dateFrom: '2026-10-06' }))).toEqual(['oct6-early']);
  });
});

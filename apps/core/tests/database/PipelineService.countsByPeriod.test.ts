import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';
import Core from '@engine/Core';

// Against a real (in-memory) SQLite with the real migrations: runs per day and failures,
// for the dashboard's Today row. The caller picks the day boundaries (its own time zone).
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
  const [task] = await knex('task').insert({ identifier: 'wf', name: 'W', source: '{}' });
  const run = (identifier: string, status: string, started_at: string | null) => ({
    identifier,
    task_id: task,
    status,
    source: '{}',
    started_at,
  });
  await knex('pipeline').insert([
    run('before', 'completed', '2026-10-19T23:59:59.999Z'), // just before the first day
    run('d1-a', 'completed', '2026-10-20T00:00:00.000Z'), // exactly on a boundary: that day
    run('d1-b', 'failed', '2026-10-20T13:00:00.000Z'),
    run('d2-a', 'failed', '2026-10-21T08:00:00.000Z'),
    run('d2-b', 'failed', '2026-10-21T09:00:00.000Z'),
    run('d2-c', 'running', '2026-10-21T10:00:00.000Z'),
    run('after', 'completed', '2026-10-22T00:00:00.000Z'), // the end boundary is exclusive
    run('pending', 'pending', null), // never started: not counted
  ]);
});
afterAll(() => knex.destroy());

const boundaries = ['2026-10-20T00:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-22T00:00:00.000Z'];

describe('PipelineService.countsByPeriod', () => {
  it('counts runs started in each period, and the failed ones', async () => {
    expect(await PipelineService.countsByPeriod(boundaries)).toEqual([
      { from: boundaries[0], to: boundaries[1], total: 2, failed: 1 },
      { from: boundaries[1], to: boundaries[2], total: 3, failed: 2 },
    ]);
  });

  it('needs at least two boundaries', async () => {
    expect(await PipelineService.countsByPeriod([boundaries[0]])).toEqual([]);
  });

  it('Core refuses boundaries that are not dates', async () => {
    await expect(Core.pipelineStats(['yesterday', 'today'])).rejects.toThrow('boundaries');
    await expect(Core.pipelineStats(null)).rejects.toThrow('boundaries');
    expect(await Core.pipelineStats(boundaries)).toHaveLength(2);
  });
});

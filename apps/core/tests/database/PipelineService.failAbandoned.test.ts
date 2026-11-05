import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

// Against a real (in-memory) SQLite with the real migrations: failAbandoned must only
// touch runs that still say running, which a mock can't check.
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
  await knex('pipeline_action').del();
  await knex('pipeline_block').del();
  await knex('pipeline').del();
  await knex('task').del();
  const [taskId] = await knex('task').insert({ identifier: 't-1', name: 'T', source: '{}' });
  const run = { task_id: taskId, source: '{}' };
  await knex('pipeline').insert([
    {
      ...run,
      id: 1,
      identifier: 'p-crashed',
      status: 'running',
      metadata: JSON.stringify({ trigger: { type: 'manual' } }),
    },
    { ...run, id: 2, identifier: 'p-done', status: 'completed' },
    { ...run, id: 3, identifier: 'p-waiting', status: 'paused' },
  ]);
  await knex('pipeline_block').insert([
    { id: 1, pipeline_id: 1 },
    { id: 3, pipeline_id: 3 },
  ]);
  await knex('pipeline_action').insert([
    { pipeline_id: 1, block_id: 1, position: 0, identifier: 'a1', status: 'completed' },
    { pipeline_id: 1, block_id: 1, position: 1, identifier: 'auth', status: 'running' },
    { pipeline_id: 1, block_id: 1, position: 2, identifier: 'a3', status: 'pending' },
    { pipeline_id: 3, block_id: 3, position: 0, identifier: 'ask', status: 'paused' },
  ]);
});

describe('PipelineService.failAbandoned', () => {
  it('fails a run still marked running, with its running step, saying why', async () => {
    const ended = await PipelineService.failAbandoned(
      ['p-crashed', 'p-done', 'p-waiting'],
      'The run stopped unexpectedly: boom'
    );
    expect(ended).toEqual(['p-crashed']);

    const runs = await knex('pipeline')
      .orderBy('id')
      .select('identifier', 'status', 'finished_at', 'metadata');
    expect(runs.map((r) => [r.identifier, r.status])).toEqual([
      ['p-crashed', 'failed'],
      ['p-done', 'completed'],
      ['p-waiting', 'paused'],
    ]);
    expect(runs[0].finished_at).toBeTruthy();
    expect(JSON.parse(runs[0].metadata)).toEqual({
      trigger: { type: 'manual' },
      reason: 'worker_exit',
      message: 'The run stopped unexpectedly: boom',
    });

    const steps = await knex('pipeline_action')
      .orderBy(['pipeline_id', 'position'])
      .select('identifier', 'status', 'error');
    expect(steps).toEqual([
      { identifier: 'a1', status: 'completed', error: null },
      { identifier: 'auth', status: 'failed', error: 'The run stopped unexpectedly: boom' },
      { identifier: 'a3', status: 'pending', error: null },
      { identifier: 'ask', status: 'paused', error: null },
    ]);
  });

  it('does nothing without runs', async () => {
    expect(await PipelineService.failAbandoned([], 'x')).toEqual([]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

// Against a real (in-memory) SQLite with the real migrations: the point of cancelIdle
// is its conditional update, which a mock can't check.
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
  await knex('pipeline').insert({
    id: 1,
    identifier: 'p-1',
    task_id: taskId,
    source: '{}',
    status: 'paused',
    metadata: JSON.stringify({ trigger: { type: 'app' }, approval: { key: '3:ask', title: 'Pay?' } }),
  });
  await knex('pipeline_block').insert({ id: 3, pipeline_id: 1 });
  const action = { pipeline_id: 1, block_id: 3, position: 0 };
  await knex('pipeline_action').insert([
    { ...action, identifier: 'a1', status: 'completed' },
    { ...action, identifier: 'ask', position: 1, status: 'paused' },
    { ...action, identifier: 'a3', position: 2, status: 'pending' },
  ]);
});

describe('PipelineService.cancelIdle', () => {
  it('cancels a waiting run once, with its waiting step, and withdraws the approval', async () => {
    const meta = { reason: 'user_canceled', canceledBy: 'ana' };
    expect(await PipelineService.cancelIdle(1, ['paused'], meta)).toBe(true);
    expect(await PipelineService.cancelIdle(1, ['paused'], meta)).toBe(false);

    const run = await knex('pipeline').where({ id: 1 }).first();
    expect(run.status).toBe('canceled');
    expect(run.finished_at).toBeTruthy();
    expect(JSON.parse(run.metadata)).toEqual({
      trigger: { type: 'app' },
      reason: 'user_canceled',
      canceledBy: 'ana',
    });
    const steps = await knex('pipeline_action').orderBy('position').select('identifier', 'status');
    expect(steps).toEqual([
      { identifier: 'a1', status: 'completed' },
      { identifier: 'ask', status: 'canceled' },
      { identifier: 'a3', status: 'pending' },
    ]);
  });

  it('leaves a run alone once it is no longer waiting (e.g. someone just decided)', async () => {
    await knex('pipeline').where({ id: 1 }).update({ status: 'running' });
    expect(await PipelineService.cancelIdle(1, ['paused'], {})).toBe(false);
    expect((await knex('pipeline').where({ id: 1 }).first()).status).toBe('running');
  });
});

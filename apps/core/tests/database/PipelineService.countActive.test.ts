import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

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

describe('PipelineService.countActive', () => {
  it('is 0 with no runs', async () => {
    expect(await PipelineService.countActive()).toBe(0);
  });

  it('counts running and paused runs, nothing else', async () => {
    const [taskId] = await knex('task').insert({ identifier: 't-1', name: 'T', source: '{}' });
    const statuses = ['running', 'paused', 'pending', 'completed', 'failed', 'canceled'];
    await knex('pipeline').insert(
      statuses.map((status) => ({
        identifier: `p-${status}`,
        task_id: taskId,
        source: '{}',
        status,
      }))
    );
    expect(await PipelineService.countActive()).toBe(2);
  });
});

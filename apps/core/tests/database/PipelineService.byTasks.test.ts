import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { PipelineService } from '@database/services/PipelineService';

// Against a real (in-memory) SQLite with the real migrations: the runs of several
// workflows, newest first, by status, limited — what an app's Runs component lists.
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
  const [a] = await knex('task').insert({ identifier: 'wf-a', name: 'A', source: '{}' });
  const [b] = await knex('task').insert({ identifier: 'wf-b', name: 'B', source: '{}' });
  const [c] = await knex('task').insert({ identifier: 'wf-c', name: 'C', source: '{}' });
  const run = (identifier: string, task_id: number, status: string, minute: number) => ({
    identifier,
    task_id,
    status,
    source: '{}',
    started_at: `2026-10-06T10:${String(minute).padStart(2, '0')}:00.000Z`,
    metadata: JSON.stringify({ trigger: { type: 'app', appName: 'X' } }),
  });
  await knex('pipeline').insert([
    run('a1', a, 'completed', 1),
    run('b1', b, 'failed', 2),
    run('c1', c, 'completed', 3), // another app's workflow
    run('a2', a, 'running', 4),
  ]);
});
afterAll(() => knex.destroy());

describe('PipelineService.getByTaskIdentifiers', () => {
  it('lists runs of the given workflows only, newest first, with their workflow', async () => {
    const rows: any[] = await PipelineService.getByTaskIdentifiers(['wf-a', 'wf-b']);
    expect(rows.map((r) => r.identifier)).toEqual(['a2', 'b1', 'a1']);
    expect(rows[0]).toMatchObject({ status: 'running', task_name: 'A', task_identifier: 'wf-a' });
  });

  it('filters by status and limits; no workflows lists nothing', async () => {
    expect((await PipelineService.getByTaskIdentifiers(['wf-a', 'wf-b'], { statuses: ['failed', 'running'] })).map((r: any) => r.identifier)).toEqual(['a2', 'b1']);
    expect((await PipelineService.getByTaskIdentifiers(['wf-a', 'wf-b'], { limit: 1 })).map((r: any) => r.identifier)).toEqual(['a2']);
    expect(await PipelineService.getByTaskIdentifiers([])).toEqual([]);
  });
});

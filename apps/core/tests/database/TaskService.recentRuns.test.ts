import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { TaskService } from '@database/services/TaskService';

// The Workflows list's run strip: each workflow's last ten run statuses, newest first.
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
  const [busy] = await knex('task').insert({ identifier: 'busy', name: 'Busy', source: '{}' });
  await knex('task').insert({ identifier: 'idle', name: 'Idle', source: '{}' });
  const runs = Array.from({ length: 12 }, (_, i) => ({
    identifier: `r${i}`,
    task_id: busy,
    status: i === 11 ? 'failed' : i === 0 ? 'canceled' : 'completed',
    source: '{}',
    started_at: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(),
  }));
  runs.push({ identifier: 'queued', task_id: busy, status: 'pending', source: '{}', started_at: null as any });
  await knex('pipeline').insert(runs);
});
afterAll(() => knex.destroy());

describe('TaskService.getAll recent_runs', () => {
  it('lists the last ten started runs newest first, and an empty list for a workflow that never ran', async () => {
    const all = await TaskService.getAll();
    const busy = all.find((t: any) => t.identifier === 'busy');
    const idle = all.find((t: any) => t.identifier === 'idle');
    expect(busy.recent_runs).toEqual(['failed', ...Array(9).fill('completed')]);
    expect(busy.last_run_status).toBe('failed');
    expect(idle.recent_runs).toEqual([]);
  });
});

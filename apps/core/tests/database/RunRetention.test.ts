import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseManager } from '@database/DatabaseManager';
import { PipelineService } from '@database/services/PipelineService';
import { DEFAULT_RUN_KEEP_DAYS, RUN_KEEP_DAYS_SETTING, RunHistoryPurger, runKeepDays } from '@engine/RunHistoryPurger';

// Against a real SQLite file with the real migrations: the file's size is part of what's tested.
const folder = fs.mkdtempSync(path.join(tmpdir(), 'run-retention-'));
process.env.HOME = folder;
const filename = path.join(folder, 'test.db');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

let knex: Knex;
let task: number;

async function run(identifier: string, status: string, startedDaysAgo: number, taskId = task) {
  const [id] = await knex('pipeline').insert({ identifier, task_id: taskId, status, source: '{}', started_at: ago(startedDaysAgo) });
  const [block] = await knex('pipeline_block').insert({ pipeline_id: id, status: 'completed', actions: '[]' }).catch(() => [null]);
  await knex('pipeline_variable').insert({ pipeline_id: id, name: 'v', value: '"x"', type: 'string', scope: 'task' });
  return { id, block };
}
const remaining = async () => (await knex('pipeline').orderBy('identifier').pluck('identifier')) as string[];

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (connection: any, done: any) => {
        connection.pragma('auto_vacuum = INCREMENTAL');
        connection.pragma('journal_mode = WAL');
        done(null, connection);
      },
    },
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});

afterAll(async () => {
  await knex.destroy();
  fs.rmSync(folder, { recursive: true, force: true });
});

beforeEach(async () => {
  await knex('pipeline').delete();
  await knex('task').delete();
  await knex('settings').where({ key: RUN_KEEP_DAYS_SETTING }).delete();
  [task] = await knex('task').insert({ identifier: 't-1', name: 'One', source: '{}' });
});

describe('deleting old runs', () => {
  it('keeps 90 days by default', async () => {
    expect(DEFAULT_RUN_KEEP_DAYS).toBe(90);
    expect(await runKeepDays()).toBe(90);
    await run('a-old', 'completed', 100);
    await run('b-recent', 'completed', 80);
    await run('c-latest', 'completed', 1);
    await PipelineService.deleteFinishedBefore(ago(90));
    expect(await remaining()).toEqual(['b-recent', 'c-latest']);
  });

  it.each(['completed', 'failed', 'canceled'])('deletes an old %s run', async (status) => {
    await run('old', status, 100);
    await run('new', 'completed', 1);
    expect(await PipelineService.deleteFinishedBefore(ago(90))).toBe(1);
    expect(await remaining()).toEqual(['new']);
  });

  it.each(['running', 'paused', 'pending'])('keeps a %s run however old', async (status) => {
    await run('old', status, 400);
    await run('new', 'completed', 1);
    expect(await PipelineService.deleteFinishedBefore(ago(90))).toBe(0);
  });

  it("keeps each workflow's latest run, even when it's old", async () => {
    const [other] = await knex('task').insert({ identifier: 't-2', name: 'Two', source: '{}' });
    await run('a-old', 'completed', 300);
    await run('b-latest', 'completed', 200);
    await run('c-only', 'completed', 300, other);
    await PipelineService.deleteFinishedBefore(ago(90));
    expect(await remaining()).toEqual(['b-latest', 'c-only']);
  });

  it('takes the steps and values with the run', async () => {
    await run('old', 'completed', 100);
    await run('new', 'completed', 1);
    await PipelineService.deleteFinishedBefore(ago(90));
    expect((await knex('pipeline_variable').count({ n: '*' }))[0].n).toBe(1);
  });

  it('handles more runs than fit in one batch', async () => {
    for (let i = 0; i < 450; i++) await knex('pipeline').insert({ identifier: `r${i}`, task_id: task, status: 'completed', source: '{}', started_at: ago(100) });
    await run('new', 'completed', 1);
    expect(await PipelineService.deleteFinishedBefore(ago(90))).toBe(450);
  });

  it('keeps everything when set to 0, or to nonsense', async () => {
    await knex('settings').insert({ key: RUN_KEEP_DAYS_SETTING, value: '0' });
    expect(await runKeepDays()).toBe(0);
    await knex('settings').where({ key: RUN_KEEP_DAYS_SETTING }).update({ value: 'soon' });
    expect(await runKeepDays()).toBe(0);
    await run('old', 'completed', 900);
    await run('new', 'completed', 1);
    await RunHistoryPurger.purge();
    expect(await remaining()).toEqual(['new', 'old']);
  });
});

describe('giving space back', () => {
  it('is on for a new database', async () => {
    expect((await knex.raw('PRAGMA auto_vacuum'))[0].auto_vacuum).toBe(2);
  });

  it('shrinks the file after deleting, without a full rewrite', async () => {
    const big = JSON.stringify('x'.repeat(200_000));
    for (let i = 0; i < 100; i++) {
      const { id } = await run(`big${i}`, 'completed', 100);
      await knex('pipeline_variable').where({ pipeline_id: id }).update({ value: big });
    }
    await knex.raw('PRAGMA wal_checkpoint(TRUNCATE)');
    const before = fs.statSync(filename).size;
    await PipelineService.deleteFinishedBefore(ago(90));
    expect((await knex.raw('PRAGMA freelist_count'))[0].freelist_count).toBeGreaterThan(1000);

    await DatabaseManager.reclaimFreeSpace(knex);
    expect((await knex.raw('PRAGMA freelist_count'))[0].freelist_count).toBe(0);
    expect(fs.statSync(filename).size).toBeLessThan(before / 5);
  });
});

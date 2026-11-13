import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertCanEnable,
  missedRunAt,
  onceFireDate,
  resolveScheduleTiming,
  toScheduleEntry,
} from '@engine/runner/scheduleTiming';
import { ScheduleService } from '@database/services/ScheduleService';

// Local time on purpose: both runners fire on the machine's own clock.
const NOW = new Date(2026, 9, 22, 10, 15, 0);
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe('resolveScheduleTiming', () => {
  it('reads plain words, crons and one-time dates', () => {
    expect(resolveScheduleTiming({ when: 'every weekday at 9am' }, NOW)).toEqual({ cron: '0 9 * * 1-5', runAt: null, everySeconds: null });
    expect(resolveScheduleTiming({ when: 'tomorrow at 8am' }, NOW)).toEqual({
      cron: null,
      runAt: new Date(2026, 9, 23, 8, 0, 0).toISOString(),
      everySeconds: null,
    });
    expect(resolveScheduleTiming({ cron: ' */20  * * * * * ' }, NOW)).toEqual({ cron: '*/20 * * * * *', runAt: null, everySeconds: null });
    expect(resolveScheduleTiming({ runAt: inHours(2) }, NOW)).toEqual({ cron: null, runAt: inHours(2), everySeconds: null });
  });

  it('needs exactly one way of saying when', () => {
    expect(() => resolveScheduleTiming({}, NOW)).toThrow(/exactly one/);
    expect(() => resolveScheduleTiming({ cron: '0 9 * * *', runAt: inHours(1) }, NOW)).toThrow(/exactly one/);
    expect(() => resolveScheduleTiming({ when: '  ', cron: '0 9 * * *' }, NOW)).not.toThrow();
  });

  it('refuses bad crons, too-frequent runs and past or unreadable times', () => {
    expect(() => resolveScheduleTiming({ cron: '0 9 * *' }, NOW)).toThrow(/5 fields/);
    expect(() => resolveScheduleTiming({ cron: '*/5 * * * * *' }, NOW)).toThrow(/every 10 seconds/);
    expect(() => resolveScheduleTiming({ runAt: inHours(-1) }, NOW)).toThrow(/already passed/);
    expect(() => resolveScheduleTiming({ runAt: 'soon' }, NOW)).toThrow(/not a date/);
    expect(() => resolveScheduleTiming({ when: 'whenever' }, NOW)).toThrow(/Try/);
    expect(() => resolveScheduleTiming({ everySeconds: 5 }, NOW)).toThrow(/every 10 seconds/);
    expect(() => resolveScheduleTiming({ everySeconds: 1.5 }, NOW)).toThrow(/not a number of seconds/);
  });

  it('reads intervals a cron cannot keep even', () => {
    expect(resolveScheduleTiming({ when: 'every 40 seconds' }, NOW)).toEqual({ cron: null, runAt: null, everySeconds: 40 });
    expect(resolveScheduleTiming({ everySeconds: 90 }, NOW)).toEqual({ cron: null, runAt: null, everySeconds: 90 });
  });
});

describe('one-time schedules', () => {
  it('fires at its time, or a second after start-up when the time was missed', () => {
    expect(onceFireDate(inHours(3), NOW).toISOString()).toBe(inHours(3));
    expect(onceFireDate(inHours(-3), NOW).getTime()).toBe(NOW.getTime() + 1000);
  });

  it('can only be turned on again while its time is still ahead and it has not run', () => {
    expect(() => assertCanEnable({ run_at: inHours(1), last_run_at: undefined }, NOW)).not.toThrow();
    expect(() => assertCanEnable({ run_at: inHours(-1), last_run_at: undefined }, NOW)).toThrow(/pick a new time/);
    expect(() => assertCanEnable({ run_at: inHours(1), last_run_at: new Date(NOW) }, NOW)).toThrow(/already run/);
    expect(() => assertCanEnable({ run_at: null, last_run_at: undefined }, NOW)).not.toThrow();
  });
});

describe('toScheduleEntry', () => {
  const base = { identifier: 's1', task: { identifier: 'wf', name: 'Report' }, variables: '{"a":1}' } as any;

  it('lists a repeating schedule with its next run', () => {
    expect(toScheduleEntry({ ...base, cron: '*/20 * * * * *', enabled: 1 }, NOW)).toEqual({
      scheduleIdentifier: 's1',
      taskIdentifier: 'wf',
      taskName: 'Report',
      cron: '*/20 * * * * *',
      runAt: null,
      everySeconds: null,
      variables: { a: 1 },
      enabled: true,
      nextRunAt: new Date(2026, 9, 22, 10, 15, 20).toISOString(),
      lastRunAt: null,
    });
  });

  it('lists an interval schedule: next run counted from its last run, or from when it was saved', () => {
    const every = { ...base, cron: null, every_seconds: 40, enabled: 1 };
    // Saved by SQLite as UTC without a zone: 100 s before NOW.
    const saved = new Date(NOW.getTime() - 100_000).toISOString().replace('T', ' ').slice(0, 19);
    expect(toScheduleEntry({ ...every, updated_at: saved }, NOW)).toMatchObject({
      everySeconds: 40,
      nextRunAt: new Date(NOW.getTime() + 20_000).toISOString(),
    });
    const ranAt = new Date(NOW.getTime() - 10_000).toISOString();
    expect(toScheduleEntry({ ...every, last_run_at: ranAt }, NOW).nextRunAt).toBe(new Date(NOW.getTime() + 30_000).toISOString());
    expect(toScheduleEntry({ ...every, enabled: 0 }, NOW).nextRunAt).toBeNull();
  });

  it('lists a one-time schedule: next run until it runs, then none', () => {
    const once = { ...base, cron: null, run_at: inHours(2), enabled: 1 };
    expect(toScheduleEntry(once, NOW)).toMatchObject({ cron: null, runAt: inHours(2), nextRunAt: inHours(2) });
    const done = { ...once, enabled: 0, last_run_at: inHours(2) };
    expect(toScheduleEntry(done, NOW)).toMatchObject({ nextRunAt: null, lastRunAt: inHours(2), enabled: false });
  });
});

describe('missedRunAt', () => {
  // NOW is 10:15; a daily 9:00 schedule last should have run at 9:00 today.
  const daily = { identifier: 's1', cron: '0 9 * * *', enabled: 1, created_at: inHours(-48) } as any;
  const nine = new Date(2026, 9, 22, 9, 0, 0).toISOString();

  it('reports the time a cron schedule should have run but did not', () => {
    expect(missedRunAt({ ...daily, last_run_at: inHours(-25) }, NOW)).toBe(nine);
    expect(missedRunAt(daily, NOW)).toBe(nine);
    expect(toScheduleEntry({ ...daily, task: { identifier: 'wf', name: 'W' } }, NOW).missedAt).toBe(nine);
  });

  it('is quiet when it ran, is paused, was saved after that time, or the time just passed', () => {
    expect(missedRunAt({ ...daily, last_run_at: new Date(2026, 9, 22, 9, 0, 1).toISOString() }, NOW)).toBeNull();
    expect(missedRunAt({ ...daily, enabled: 0 }, NOW)).toBeNull();
    expect(missedRunAt({ ...daily, updated_at: inHours(-1) }, NOW)).toBeNull();
    // 10:14 is a minute ago: the runner may still be recording it.
    expect(missedRunAt({ ...daily, cron: '14 10 * * *' }, NOW)).toBeNull();
    expect(missedRunAt({ ...daily, cron: 'not a cron' }, NOW)).toBeNull();
    expect('missedAt' in toScheduleEntry({ ...daily, enabled: 0, task: { identifier: 'wf', name: 'W' } }, NOW)).toBe(false);
  });

  it('never applies to interval or one-time schedules', () => {
    expect(missedRunAt({ ...daily, cron: null, every_seconds: 60 }, NOW)).toBeNull();
    expect(missedRunAt({ ...daily, cron: null, run_at: inHours(-3) }, NOW)).toBeNull();
  });
});

describe('ScheduleService (real database)', () => {
  let knex: Knex;
  let taskId: number;

  beforeAll(async () => {
    knex = knexFactory({
      client: 'better-sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
      migrations: { directory: path.resolve(__dirname, '../../../src/database/migrations') },
    });
    await knex.migrate.latest();
    Model.knex(knex);
    [taskId] = await knex('task').insert({ identifier: 'wf-report', name: 'Report', source: '{}' });
  });
  afterAll(async () => {
    await knex.destroy();
  });
  beforeEach(async () => {
    await knex('schedule').delete();
  });

  it('stores a one-time schedule without a cron', async () => {
    const runAt = inHours(5);
    const created = await ScheduleService.create('wf-report', { runAt }, { a: 1 });
    const row = await knex('schedule').where({ identifier: created.identifier }).first();
    expect(row).toMatchObject({ task_id: taskId, cron: null, run_at: runAt, enabled: 1 });
  });

  it('turns a one-time schedule off when it runs, and only notes the time for a cron', async () => {
    const once = await ScheduleService.create('wf-report', { runAt: inHours(5) });
    const daily = await ScheduleService.create('wf-report', { cron: '0 9 * * *' });

    await ScheduleService.markLastRun(once.identifier);
    await ScheduleService.markLastRun(daily.identifier);

    const rows = await knex('schedule').select('identifier', 'enabled', 'last_run_at').orderBy('id');
    expect(rows[0]).toMatchObject({ identifier: once.identifier, enabled: 0 });
    expect(rows[1]).toMatchObject({ identifier: daily.identifier, enabled: 1 });
    expect(rows.every((r) => r.last_run_at)).toBe(true);
  });

  it('stores an interval schedule', async () => {
    const created = await ScheduleService.create('wf-report', { everySeconds: 40 });
    const row = await knex('schedule').where({ identifier: created.identifier }).first();
    expect(row).toMatchObject({ cron: null, run_at: null, every_seconds: 40 });
  });
});

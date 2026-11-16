import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';

// The run's own record is mocked; alerts and workflows use a real in-memory database.
vi.mock('@database/services/PipelineService', () => ({
  PipelineService: { getById: vi.fn(), mergeMetadata: vi.fn() },
}));

import { GroupAlert } from '@/action/actions/alert/actions';
import { AlertService, ALERT_KEEP_DAYS } from '@database/services/AlertService';
import { TaskService } from '@database/services/TaskService';
import { TrashService } from '@database/services/TrashService';
import { PipelineService } from '@database/services/PipelineService';
import { Task } from '@task/Task';
import { validations, CAPABILITY_RULES } from '@tipeline/schemas';

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
  await knex('alert').del();
  await knex('task').del();
  await knex('task').insert({ identifier: 'traffic', name: 'Traffic report', source: '{}' });
  vi.mocked(PipelineService.getById)
    .mockReset()
    .mockResolvedValue({ metadata: {} } as any);
  vi.mocked(PipelineService.mergeMetadata).mockReset();
});

/** A run of the traffic workflow; saved runs have a pipeline id and identifier. */
function run(options: { saved?: boolean; identifier?: string; pipeline?: string } = {}) {
  const task = new Task();
  task.setIdentifier(options.identifier ?? 'traffic');
  task.setShouldSave(options.saved ?? false);
  const pipeline = task.getPipeline();
  if (options.saved) {
    (pipeline as any).id = 7;
    (pipeline as any).identifier = options.pipeline ?? 'run-1';
  }
  return task;
}

describe('alert schemas', () => {
  it('raise needs a title; level is info, warning or critical', () => {
    const raise = validations.alert.raise.runtime;
    expect(() => raise.validate({})).toThrow();
    expect(() => raise.validate({ title: '  ' })).toThrow();
    expect(() => raise.validate({ title: 'Spike', level: 'loud' })).toThrow();
    expect(raise.validate({ title: 'Spike', level: 'critical', key: 'k' })).toMatchObject({
      title: 'Spike',
      level: 'critical',
      key: 'k',
    });
  });

  it('resolve needs a key', () => {
    expect(() => validations.alert.resolve.runtime.validate({})).toThrow();
    expect(validations.alert.resolve.runtime.validate({ key: 'k' })).toEqual({ key: 'k' });
  });

  it('templates are accepted when saving a step', () => {
    expect(() =>
      validations.alert.raise.creation.validate({
        title: 'Spike: {{ site }}',
        key: 'spike-{{ site }}',
      })
    ).not.toThrow();
  });

  it('needs no capability', () => {
    expect(CAPABILITY_RULES.alert).toEqual({ other: [] });
  });
});

describe('alert.raise', () => {
  it('creates an alert the first time, warning by default', async () => {
    const result = await GroupAlert.raise(
      { title: 'Traffic spike: acme', key: 'spike-acme' },
      run()
    );
    expect(result).toMatchObject({ key: 'spike-acme', count: 1, isNew: true });
    expect(result.id).toEqual(expect.any(String));

    const [alert] = await AlertService.list();
    expect(alert).toMatchObject({
      id: result.id,
      taskIdentifier: 'traffic',
      workflowName: 'Traffic report',
      level: 'warning',
      status: 'open',
      count: 1,
      pipelineIdentifier: null,
    });
  });

  it('the same key updates the open alert: count, message, level and latest run', async () => {
    const first = await GroupAlert.raise(
      { title: 'Spike', message: '900 visits', key: 'spike-acme' },
      run({ saved: true, pipeline: 'run-1' })
    );
    const second = await GroupAlert.raise(
      { title: 'Spike', message: '1200 visits', level: 'critical', key: 'spike-acme' },
      run({ saved: true, pipeline: 'run-2' })
    );

    expect(second).toEqual({ id: first.id, key: 'spike-acme', count: 2, isNew: false });
    const alerts = await AlertService.list();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      message: '1200 visits',
      level: 'critical',
      pipelineIdentifier: 'run-2',
      count: 2,
    });
    expect(Date.parse(alerts[0].lastRaisedAt)).toBeGreaterThanOrEqual(
      Date.parse(alerts[0].firstRaisedAt)
    );
  });

  it('a new key creates another alert', async () => {
    await GroupAlert.raise({ title: 'Spike', key: 'spike-acme' }, run());
    const other = await GroupAlert.raise({ title: 'Spike', key: 'spike-globex' }, run());
    expect(other.isNew).toBe(true);
    expect(await AlertService.list()).toHaveLength(2);
  });

  it('without a key, the title is the key', async () => {
    await GroupAlert.raise({ title: 'Disk almost full' }, run());
    const again = await GroupAlert.raise({ title: 'Disk almost full' }, run());
    expect(again).toMatchObject({ key: 'Disk almost full', count: 2, isNew: false });
  });

  it('the same key from another workflow is another alert', async () => {
    await knex('task').insert({ identifier: 'other', name: 'Other', source: '{}' });
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    const theirs = await GroupAlert.raise(
      { title: 'Spike', key: 'k' },
      run({ identifier: 'other' })
    );
    expect(theirs.isNew).toBe(true);
  });

  it('notes the alert on a saved run, once', async () => {
    const result = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run({ saved: true }));
    expect(PipelineService.mergeMetadata).toHaveBeenCalledWith(7, {
      alerts: [{ id: result.id, title: 'Spike', level: 'warning' }],
    });

    vi.mocked(PipelineService.getById).mockResolvedValue({
      metadata: { alerts: [{ id: result.id, title: 'Spike', level: 'warning' }] },
    } as any);
    vi.mocked(PipelineService.mergeMetadata).mockClear();
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run({ saved: true }));
    expect(PipelineService.mergeMetadata).not.toHaveBeenCalled();
  });

  it("a run that isn't saved still raises it, with no run link", async () => {
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run({ saved: false }));
    expect((await AlertService.list())[0].pipelineIdentifier).toBeNull();
    expect(PipelineService.mergeMetadata).not.toHaveBeenCalled();
  });

  it("a draft's test run doesn't save an alert", async () => {
    await knex('task')
      .where({ identifier: 'traffic' })
      .update({ metadata: JSON.stringify({ draft: true }) });
    const result = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run({ saved: true }));
    expect(result).toEqual({ id: null, key: 'k', count: 1, isNew: true });
    expect(await AlertService.list({ includeClosed: true })).toEqual([]);
  });
});

describe('alert.resolve', () => {
  it('closes the open alert with that key', async () => {
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect(await GroupAlert.resolve({ key: 'k' }, run())).toEqual({ resolved: true });
    expect(await AlertService.list()).toEqual([]);
    const [closed] = await AlertService.list({ includeClosed: true });
    expect(closed).toMatchObject({ status: 'resolved', closedBy: 'workflow' });
    expect(closed.closedAt).toBeTruthy();
  });

  it('does nothing when there is none', async () => {
    expect(await GroupAlert.resolve({ key: 'k' }, run())).toEqual({ resolved: false });
  });

  it('only closes its own workflow’s alert', async () => {
    await knex('task').insert({ identifier: 'other', name: 'Other', source: '{}' });
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run({ identifier: 'other' }));
    expect(await GroupAlert.resolve({ key: 'k' }, run())).toEqual({ resolved: false });
    expect(await AlertService.list()).toHaveLength(1);
  });

  it('a raise after resolve opens a new alert', async () => {
    const first = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    await GroupAlert.resolve({ key: 'k' }, run());
    const next = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect(next.isNew).toBe(true);
    expect(next.id).not.toBe(first.id);
  });

  it('the hourly report: raise, raise, resolve', async () => {
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect((await AlertService.list())[0].count).toBe(1);
    await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect((await AlertService.list())[0].count).toBe(2);
    await GroupAlert.resolve({ key: 'k' }, run());
    expect(await AlertService.list()).toEqual([]);
  });
});

describe('dismiss (acknowledge)', () => {
  it('a dismissed alert stays quiet while the same key keeps being raised', async () => {
    const { id } = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect(await AlertService.dismiss({ id: id! }, 'desktop')).toBe(1);
    expect(await AlertService.list()).toEqual([]);

    const again = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect(again).toMatchObject({ id, count: 2, isNew: false });
    expect(await AlertService.list()).toEqual([]);
    expect((await AlertService.list({ includeClosed: true }))[0]).toMatchObject({
      status: 'dismissed',
      closedBy: 'desktop',
    });
  });

  it('resolve closes an acknowledged alert, and the next raise is new and open', async () => {
    const { id } = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    await AlertService.dismiss({ id: id! });
    expect(await GroupAlert.resolve({ key: 'k' }, run())).toEqual({ resolved: true });
    const next = await GroupAlert.raise({ title: 'Spike', key: 'k' }, run());
    expect(next.isNew).toBe(true);
    expect(await AlertService.list()).toHaveLength(1);
  });

  it('all dismisses every open alert', async () => {
    await GroupAlert.raise({ title: 'A' }, run());
    await GroupAlert.raise({ title: 'B' }, run());
    expect(await AlertService.dismiss({ all: true })).toBe(2);
    expect(await AlertService.list()).toEqual([]);
  });

  it('reopen puts an acknowledged alert back', async () => {
    const { id } = await GroupAlert.raise({ title: 'Spike' }, run());
    await AlertService.dismiss({ id: id! });
    expect(await AlertService.reopen(id!)).toBe(true);
    expect((await AlertService.list())[0]).toMatchObject({ id, status: 'open', closedAt: null });
    expect(await AlertService.reopen(id!)).toBe(false);
  });
});

describe('keeping alerts tidy', () => {
  it('prunes resolved alerts after 30 days and acknowledged ones nobody raised for 30 days', async () => {
    const old = new Date(Date.now() - (ALERT_KEEP_DAYS + 1) * 86_400_000).toISOString();
    const row = (identifier: string, status: string) => ({
      identifier,
      task_identifier: 'traffic',
      key: identifier,
      title: identifier,
      level: 'warning',
      status,
      count: 1,
      first_raised_at: old,
      last_raised_at: old,
      closed_at: status === 'open' ? null : old,
    });
    await knex('alert').insert([
      row('open-old', 'open'),
      row('resolved-old', 'resolved'),
      row('dismissed-old', 'dismissed'),
    ]);
    await GroupAlert.raise({ title: 'fresh', key: 'fresh' }, run());
    await AlertService.dismiss({
      ids: [(await AlertService.list({ ids: undefined })).find((a) => a.key === 'fresh')!.id],
    });

    expect(await AlertService.prune()).toBe(2);
    const left = (await AlertService.list({ includeClosed: true })).map((a) => a.key).sort();
    expect(left).toEqual(['fresh', 'open-old']);
  });

  it('uninstalling a workflow deletes its alerts', async () => {
    await GroupAlert.raise({ title: 'Spike' }, run());
    await TaskService.uninstall('traffic');
    expect(await AlertService.list({ includeClosed: true })).toEqual([]);
  });

  it('moving a workflow to the Trash deletes its alerts', async () => {
    await knex('task').insert({ identifier: 'other', name: 'Other', source: '{}' });
    await GroupAlert.raise({ title: 'Spike' }, run());
    await GroupAlert.raise({ title: 'Theirs' }, run({ identifier: 'other' }));
    await TrashService.trash('task', 'traffic');
    expect((await AlertService.list()).map((a) => a.taskIdentifier)).toEqual(['other']);
  });
});

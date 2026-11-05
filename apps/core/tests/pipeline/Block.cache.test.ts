import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';

vi.mock('@database/services/PipelineActionService', () => ({
  PipelineActionService: { getByBlock: vi.fn(async () => []), updateStatus: vi.fn() },
}));
vi.mock('@database/services/PipelineVariableService', () => ({
  PipelineVariableService: { updateValue: vi.fn() },
}));

import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { Action } from '@action/Action';
import { Variable } from '@variable/Variable';
import { coreEvents } from '@engine/CoreEvents';
import { PipelineActionService } from '@database/services/PipelineActionService';

// The cache itself is real (in-memory SQLite, real migrations): the point is what a
// second run gets back from what the first one stored.
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
  await knex('cache_entries').del();
  vi.mocked(PipelineActionService.updateStatus).mockReset();
});

function makeTask(mode?: 'use' | 'bypass' | 'refresh', correlationId = 'corr-cache') {
  const task = new Task();
  task.setIdentifier('wf-1');
  task.setCorrelationId(correlationId);
  task.setCacheMode(mode);
  task.getPipeline().setVariables([
    new Variable({ name: 'total', type: 'number', value: 0 } as any),
    new Variable({ name: 'b', type: 'number', value: 3 } as any),
  ]);
  return task;
}

function sumStep(extra: Partial<ConstructorParameters<typeof Action>[0]> = {}) {
  const action = new Action({
    group: 'math',
    name: 'sum',
    identifier: 'sum-1',
    params: { array: [2, '{{ b }}'] },
    destination: 'total',
    cache: { ttl: '1h' },
    ...extra,
  });
  const execute = vi.spyOn(action, 'execute');
  return { action, execute };
}

async function runOnce(task: Task, action: Action) {
  await new Block([action], task, 0).run();
  return task.getPipeline().getVariableByName('total')?.getValue();
}

describe('Block — step cache', () => {
  it('runs the step the first time and serves the stored result the next', async () => {
    const first = sumStep();
    expect(await runOnce(makeTask(), first.action)).toBe(5);
    expect(first.execute).toHaveBeenCalledTimes(1);

    const second = sumStep();
    expect(await runOnce(makeTask(), second.action)).toBe(5);
    expect(second.execute).not.toHaveBeenCalled();
  });

  it('runs again when a resolved param differs', async () => {
    await runOnce(makeTask(), sumStep().action);
    const task = makeTask();
    task.getPipeline().getVariableByName('b')!.setValue(10);
    const step = sumStep();
    expect(await runOnce(task, step.action)).toBe(12);
    expect(step.execute).toHaveBeenCalledTimes(1);
  });

  it('marks a step served from the cache in its event and its run record', async () => {
    await runOnce(makeTask(), sumStep().action);
    const events: any[] = [];
    const listener = (data: any) => events.push(data);
    coreEvents.on('action:corr-saved', listener);
    try {
      const task = makeTask('use', 'corr-saved');
      task.setShouldSave(true);
      await new Block([sumStep().action], task, 7).run();
    } finally {
      coreEvents.off('action:corr-saved', listener);
    }
    expect(events[0]).toMatchObject({ name: 'math.sum', result: 5, cached: true });
    expect(events[0].cachedAt).toEqual(expect.any(String));
    expect(PipelineActionService.updateStatus).toHaveBeenCalledWith(
      0,
      7,
      'sum-1',
      'completed',
      expect.objectContaining({ result: 5, cached: true })
    );
  });

  it('bypass runs the step and leaves the cache alone', async () => {
    const step = sumStep();
    await runOnce(makeTask('bypass'), step.action);
    expect(step.execute).toHaveBeenCalledTimes(1);
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('refresh runs the step and replaces what is stored', async () => {
    await runOnce(makeTask(), sumStep().action);
    const [before] = await knex('cache_entries');
    const step = sumStep();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runOnce(makeTask('refresh'), step.action);
    expect(step.execute).toHaveBeenCalledTimes(1);
    const [after] = await knex('cache_entries');
    expect(after.key).toBe(before.key);
    expect(after.created_at > before.created_at).toBe(true);
  });

  it('does nothing for a step without a cache setting', async () => {
    const step = sumStep({ cache: undefined });
    await runOnce(makeTask(), step.action);
    await runOnce(makeTask(), step.action);
    expect(step.execute).toHaveBeenCalledTimes(2);
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('never stores a failure turned into undefined by onError: continue', async () => {
    const step = sumStep({ onError: 'continue' });
    step.execute.mockResolvedValue(undefined);
    await runOnce(makeTask(), step.action);
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('never stores a result that is not plain data', async () => {
    class Handle {}
    const step = sumStep({ destination: '' });
    step.execute.mockResolvedValue(new Handle());
    await runOnce(makeTask(), step.action);
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('records which workflow and step the entry belongs to', async () => {
    await runOnce(makeTask(), sumStep().action);
    const [row] = await knex('cache_entries');
    expect(row).toMatchObject({ kind: 'action', owner: 'wf-1', label: 'math.sum', ttl_seconds: 3600 });
  });
});

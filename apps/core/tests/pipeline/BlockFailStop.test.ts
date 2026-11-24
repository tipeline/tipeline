import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: { getAll: vi.fn(async () => []) },
}));

import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { ActionFactory } from '@action/ActionFactory';
import { coreEvents } from '@engine/CoreEvents';
import { GlobalVariableService } from '@database/services/GlobalVariableService';
import { RunStoppedSignal } from '@utils/errors';

// flow.fail / flow.stop run the real way: through a Block, with real actions.
async function runSteps(steps: any[]) {
  const task = new Task();
  const correlationId = `fail-stop-${Math.random()}`;
  task.setCorrelationId(correlationId);
  await task.loadVariables([
    { name: 'seen', type: 'string', value: '', required: false },
    { name: 'reason', type: 'string', value: 'quota exceeded', required: false },
  ]);
  const finished: Array<{ name: string; result: unknown; stopped?: boolean }> = [];
  const failed: Array<{ name: string; error: string }> = [];
  const onAction = (event: any) => finished.push({ name: event.name, result: event.result, stopped: event.stopped });
  const onError = (event: any) => failed.push({ name: event.name, error: event.error });
  coreEvents.on(`action:${correlationId}`, onAction);
  coreEvents.on(`actionError:${correlationId}`, onError);
  const actions = [];
  for (const [index, step] of steps.entries()) {
    actions.push(await ActionFactory.create({ identifier: `s${index}`, ...step }));
  }
  const seen = () => task.getPipeline().getVariableByName('seen')?.getValue();
  try {
    await new Block(actions, task, 0).run();
    return { seen, finished, failed, error: undefined as any };
  } catch (error: any) {
    return { seen, finished, failed, error };
  } finally {
    coreEvents.off(`action:${correlationId}`, onAction);
    coreEvents.off(`actionError:${correlationId}`, onError);
  }
}

const flow = (name: string, params: any, extra: any = {}) => ({ group: 'flow', name, params, ...extra });
const markSeen = { group: 'variable', name: 'set', params: { name: 'seen', value: 'after' } };
const whenTrue = (actions: any[]) =>
  flow('ifConditional', { firstOperand: 'a', compareAs: 'string', operator: 'eq', secondOperand: 'a', actions });

beforeEach(() => {
  vi.mocked(GlobalVariableService.getAll).mockReset();
  vi.mocked(GlobalVariableService.getAll).mockResolvedValue([]);
});

describe('flow.fail', () => {
  it('fails the run with its message (templates filled in) and the steps after it never run', async () => {
    const run = await runSteps([whenTrue([flow('fail', { message: 'Lookup failed: {{ reason }}' })]), markSeen]);

    expect(run.error?.message).toBe('Lookup failed: quota exceeded');
    expect(run.failed[0]).toEqual({ name: 'flow.fail', error: 'Lookup failed: quota exceeded' });
    expect(run.seen()).toBe('');
  });

  it('is a failure like any other: onError continue on it lets the run go on', async () => {
    const run = await runSteps([flow('fail', { message: 'ignored' }, { onError: 'continue' }), markSeen]);

    expect(run.error).toBeUndefined();
    expect(run.seen()).toBe('after');
  });

  it('needs a message: a workflow without one does not load', async () => {
    await expect(ActionFactory.create(flow('fail', { message: '' }))).rejects.toThrow(/flow\.fail: message/);
  });
});

describe('flow.stop', () => {
  it('ends the run early: the stop and the If around it finish, the steps after it never run', async () => {
    const run = await runSteps([whenTrue([flow('stop', { message: ' No new items ' }), markSeen]), markSeen]);

    expect(run.error).toBeInstanceOf(RunStoppedSignal);
    expect(run.error.reason).toBe('No new items');
    expect(run.seen()).toBe('');
    expect(run.failed).toEqual([]);
    expect(run.finished).toEqual([
      { name: 'flow.stop', result: 'No new items', stopped: true },
      { name: 'flow.ifConditional', result: null, stopped: true },
    ]);
  });

  it('is never swallowed by onError continue, on itself or on the step around it', async () => {
    const run = await runSteps([
      flow(
        'ifConditional',
        {
          firstOperand: 'a',
          compareAs: 'string',
          operator: 'eq',
          secondOperand: 'a',
          actions: [flow('stop', {}, { onError: 'continue' })],
        },
        { onError: 'continue' }
      ),
      markSeen,
    ]);

    expect(run.error).toBeInstanceOf(RunStoppedSignal);
    expect(run.seen()).toBe('');
  });

  it('ends a loop and the run, not just the current iteration', async () => {
    const run = await runSteps([
      flow('forEachLoop', { iterable: ['x', 'y'], currentItem: 'seen', actions: [flow('stop', {})] }),
      markSeen,
    ]);

    expect(run.error).toBeInstanceOf(RunStoppedSignal);
    expect(run.error.reason).toBe('');
    expect(run.seen()).toBe('x');
  });
});

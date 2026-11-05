import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/PipelineRunnerService', () => ({
  PipelineRunnerService: {
    startPipeline: vi.fn(),
  },
}));

vi.mock('@database/services/PipelineBlockService', () => ({
  PipelineBlockService: {
    startBlock: vi.fn(),
  },
}));

vi.mock('@database/services/PipelineService', () => ({
  PipelineService: {
    updateStatus: vi.fn(),
  },
}));

import { Pipeline } from '@pipeline/Pipeline';
import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';
import { PipelineRunnerService } from '@database/services/PipelineRunnerService';
import { PipelineBlockService } from '@database/services/PipelineBlockService';
import { PipelineService } from '@database/services/PipelineService';
import { coreEvents } from '@engine/CoreEvents';
import { RunCanceledSignal } from '@utils/errors';
import { DebugController } from '@engine/DebugController';

function makeAction(identifier: string, disabled = false): any {
  return { identifier, disabled, group: 'g', name: 'n' };
}

function makeTask(shouldSave: boolean, correlationId = 'corr-1'): Task {
  const task = new Task();
  task.setShouldSave(shouldSave);
  task.setCorrelationId(correlationId);
  task.setIdentifier('task-id');
  task.setName('Task Name');
  task.setDescription('Task Desc');
  return task;
}

describe('Pipeline', () => {
  let blockRunSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(PipelineRunnerService.startPipeline).mockReset();
    vi.mocked(PipelineBlockService.startBlock).mockReset();
    vi.mocked(PipelineService.updateStatus).mockReset();
    // Block.run() is exercised by its own dedicated suite (tests/pipeline/Block.test.ts).
    // Here we stub it out so Pipeline's own orchestration logic (persistence calls,
    // event ordering, cleanup, error propagation) can be tested in isolation without
    // needing to mock Block's internal DB dependencies.
    blockRunSpy = vi.spyOn(Block.prototype, 'run').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addAction / setActions', () => {
    it('addAction appends to the actions list', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      const a1 = makeAction('a1');
      const a2 = makeAction('a2');

      pipeline.addAction(a1);
      pipeline.addAction(a2);

      expect((pipeline as any).actions).toEqual([a1, a2]);
    });

    it('setActions replaces the actions list', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      pipeline.addAction(makeAction('a1'));

      const replacement = [makeAction('b1'), makeAction('b2')];
      pipeline.setActions(replacement);

      expect((pipeline as any).actions).toEqual(replacement);
    });
  });

  describe('setVariables / addVariables / getVariableByName', () => {
    it('setVariables replaces the variable list', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      const v1 = new Variable({ type: 'string', name: 'v1', value: 'a' } as any);

      pipeline.setVariables([v1]);

      expect(pipeline.getVariables()).toEqual([v1]);
    });

    it('addVariables appends rather than replaces', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      const v1 = new Variable({ type: 'string', name: 'v1', value: 'a' } as any);
      const v2 = new Variable({ type: 'string', name: 'v2', value: 'b' } as any);

      pipeline.setVariables([v1]);
      pipeline.addVariables([v2]);

      expect(pipeline.getVariables()).toEqual([v1, v2]);
    });

    it('getVariableByName finds a variable by name', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      const v1 = new Variable({ type: 'string', name: 'target', value: 'a' } as any);
      pipeline.setVariables([v1]);

      expect(pipeline.getVariableByName('target')).toBe(v1);
    });

    it('getVariableByName returns undefined when not found', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();

      expect(pipeline.getVariableByName('missing')).toBeUndefined();
    });
  });

  describe('setCurrentContext / getCurrentContext', () => {
    it('round-trips blockId and actionPosition', () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();

      expect(pipeline.getCurrentContext()).toEqual([0, 0]);
      pipeline.setCurrentContext(5, 2);
      expect(pipeline.getCurrentContext()).toEqual([5, 2]);
    });
  });

  describe('createChildBlock', () => {
    it('returns a no-op Block (blockId 0) without calling PipelineBlockService when shouldSave is false', async () => {
      const task = makeTask(false);
      const pipeline = task.getPipeline();
      const actions = [makeAction('a1'), makeAction('a2', true)];

      const block = await pipeline.createChildBlock(actions);

      expect(block.getBlockId()).toBe(0);
      expect(PipelineBlockService.startBlock).not.toHaveBeenCalled();
    });

    it('calls PipelineBlockService.startBlock with disabled actions filtered out and the current parent context, and returns a Block wrapping the new record id when shouldSave is true', async () => {
      const task = makeTask(true);
      const pipeline = task.getPipeline();
      pipeline.setCurrentContext(3, 1);
      (pipeline as any).id = 99;
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 123 } as any);

      const actions = [makeAction('keep1'), makeAction('skip', true), makeAction('keep2')];
      const block = await pipeline.createChildBlock(actions, 2, { some: 'meta' });

      expect(PipelineBlockService.startBlock).toHaveBeenCalledWith(
        99,
        ['keep1', 'keep2'],
        3,
        1,
        2,
        { some: 'meta' }
      );
      expect(block.getBlockId()).toBe(123);
    });

    it('defaults iteration to null and metadata to undefined when not provided', async () => {
      const task = makeTask(true);
      const pipeline = task.getPipeline();
      (pipeline as any).id = 5;
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 7 } as any);

      await pipeline.createChildBlock([makeAction('a1')]);

      expect(PipelineBlockService.startBlock).toHaveBeenCalledWith(5, ['a1'], 0, 0, null, undefined);
    });
  });

  describe('run', () => {
    it('happy path: persists pipeline/block, emits taskStart then taskEnd, and marks the pipeline completed', async () => {
      const task = makeTask(true, 'corr-run');
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1'), makeAction('a2', true)]);

      vi.mocked(PipelineRunnerService.startPipeline).mockResolvedValue({
        id: 10,
        identifier: 'pipe-10',
      } as any);
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 55 } as any);
      vi.mocked(PipelineService.updateStatus).mockResolvedValue({} as any);

      const events: string[] = [];
      const emitSpy = vi.spyOn(coreEvents, 'emit').mockImplementation((event: string, ...args: any[]) => {
        events.push(event);
        return true;
      });

      await pipeline.run();

      expect(PipelineRunnerService.startPipeline).toHaveBeenCalledWith('task-id', pipeline.getVariables(), undefined);
      expect(PipelineBlockService.startBlock).toHaveBeenCalledWith(10, ['a1'], null, null);
      expect(PipelineService.updateStatus).toHaveBeenCalledWith(10, 'completed', {
        finishedAt: expect.any(Date),
      });
      expect(pipeline.getId()).toBe(10);
      expect(pipeline.getIdentifier()).toBe('pipe-10');
      expect(events.indexOf('taskStart:corr-run')).toBeGreaterThanOrEqual(0);
      expect(events.indexOf('taskEnd:corr-run')).toBeGreaterThan(events.indexOf('taskStart:corr-run'));
      expect(blockRunSpy).toHaveBeenCalledTimes(1);

      emitSpy.mockRestore();
    });

    it('on root block failure: marks the pipeline failed, still emits taskEnd, still cleans up variables, and re-throws', async () => {
      const task = makeTask(true, 'corr-run-fail');
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1')]);
      const v1 = new Variable({ type: 'string', name: 'v1', value: 'a' } as any);
      const cleanupSpy = vi.spyOn(v1, 'cleanup');
      pipeline.setVariables([v1]);

      vi.mocked(PipelineRunnerService.startPipeline).mockResolvedValue({
        id: 11,
        identifier: 'pipe-11',
      } as any);
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 56 } as any);
      vi.mocked(PipelineService.updateStatus).mockResolvedValue({} as any);

      const boom = new Error('block exploded');
      blockRunSpy.mockRejectedValue(boom);

      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(pipeline.run()).rejects.toThrow('block exploded');

      expect(PipelineService.updateStatus).toHaveBeenCalledWith(11, 'failed', {
        finishedAt: expect.any(Date),
        metadata: { reason: 'action_error', message: 'block exploded' },
      });
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('taskEnd:corr-run-fail', expect.objectContaining({ status: 'failed' }));
    });
  });

  describe('sub-workflow start event', () => {
    it('names the calling run and step, and in the debugger the values it starts with', async () => {
      const task = makeTask(false, 'corr-sub');
      task.setCallStack(['task-id']);
      const parent = { pipelineIdentifier: 'p-run', taskIdentifier: 'sync', taskName: 'Sync', stepIdentifier: 'call' };
      task.setParentRun(parent);
      task.getPipeline().setVariables([
        new Variable({ name: 'customerId', type: 'number', value: 7 } as any),
        new Variable({ name: 'token', type: 'string', value: 'abc', secret: true } as any),
      ]);
      DebugController.enable('corr-sub', false, { debugMode: true });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await task.getPipeline().runClean();
      DebugController.cleanup('corr-sub');

      const start = emitSpy.mock.calls.find(([event]) => event === 'taskStart:corr-sub')?.[1] as any;
      expect(start.parent).toEqual(parent);
      expect(start.variables).toEqual([
        { name: 'customerId', value: 7 },
        { name: 'token', value: null },
      ]);
    });

    it('sends no values outside the debugger', async () => {
      const task = makeTask(false, 'corr-sub-plain');
      task.setCallStack(['task-id']);
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await task.getPipeline().runClean();

      const start = emitSpy.mock.calls.find(([event]) => event === 'taskStart:corr-sub-plain')?.[1] as any;
      expect(start.variables).toBeUndefined();
    });
  });

  describe('runClean', () => {
    it('never touches PipelineRunnerService/PipelineBlockService/PipelineService, leaves id/identifier at 0/"", still emits events and cleans up', async () => {
      const task = makeTask(false, 'corr-clean');
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1')]);
      const v1 = new Variable({ type: 'string', name: 'v1', value: 'a' } as any);
      const cleanupSpy = vi.spyOn(v1, 'cleanup');
      pipeline.setVariables([v1]);

      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await pipeline.runClean();

      expect(PipelineRunnerService.startPipeline).not.toHaveBeenCalled();
      expect(PipelineBlockService.startBlock).not.toHaveBeenCalled();
      expect(PipelineService.updateStatus).not.toHaveBeenCalled();
      expect(pipeline.getId()).toBe(0);
      expect(pipeline.getIdentifier()).toBe('');
      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('taskStart:corr-clean', expect.any(Object));
      expect(emitSpy).toHaveBeenCalledWith('taskEnd:corr-clean', expect.any(Object));
      expect(blockRunSpy).toHaveBeenCalledTimes(1);
    });

    it('still emits taskEnd and cleans up variables even when the block throws, and re-throws', async () => {
      const task = makeTask(false, 'corr-clean-fail');
      const pipeline = task.getPipeline();
      const v1 = new Variable({ type: 'string', name: 'v1', value: 'a' } as any);
      const cleanupSpy = vi.spyOn(v1, 'cleanup');
      pipeline.setVariables([v1]);

      blockRunSpy.mockRejectedValue(new Error('clean boom'));
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(pipeline.runClean()).rejects.toThrow('clean boom');

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy).toHaveBeenCalledWith('taskEnd:corr-clean-fail', expect.objectContaining({ status: 'failed' }));
    });
  });

  describe('canceled runs', () => {
    function persisted(correlationId: string) {
      const task = makeTask(true, correlationId);
      vi.mocked(PipelineRunnerService.startPipeline).mockResolvedValue({ id: 20, identifier: 'pipe-20' } as any);
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 60 } as any);
      vi.mocked(PipelineService.updateStatus).mockResolvedValue({} as any);
      blockRunSpy.mockRejectedValue(new RunCanceledSignal('ana@acme.com'));
      return task;
    }

    it('a top-level run ends as canceled (saying who), without failing, and reports it on taskEnd', async () => {
      const task = persisted('corr-cancel');
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(task.getPipeline().run()).resolves.toBeUndefined();

      expect(PipelineService.updateStatus).toHaveBeenCalledWith(20, 'canceled', {
        finishedAt: expect.any(Date),
        metadata: { reason: 'user_canceled', message: 'Canceled by ana@acme.com', canceledBy: 'ana@acme.com' },
      });
      expect(PipelineService.updateStatus).not.toHaveBeenCalledWith(20, 'failed', expect.anything());
      expect(emitSpy).toHaveBeenCalledWith(
        'taskEnd:corr-cancel',
        expect.objectContaining({ status: 'canceled' })
      );
    });

    it('a sub-workflow its parent waits for passes the cancel up, so the parent stops too', async () => {
      const task = persisted('corr-child');
      task.setAwaitedByParent(true);

      await expect(task.getPipeline().run()).rejects.toBeInstanceOf(RunCanceledSignal);
      expect(PipelineService.updateStatus).toHaveBeenCalledWith(20, 'canceled', expect.anything());
    });

    it('a run that does not persist (runClean) ends as canceled too', async () => {
      const task = makeTask(false, 'corr-clean-cancel');
      blockRunSpy.mockRejectedValue(new RunCanceledSignal(''));
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(task.getPipeline().runClean()).resolves.toBeUndefined();

      expect(PipelineService.updateStatus).not.toHaveBeenCalled();
      expect(emitSpy).toHaveBeenCalledWith(
        'taskEnd:corr-clean-cancel',
        expect.objectContaining({ status: 'canceled' })
      );
    });
  });

  it('records the trigger (e.g. the app that started the run) on the pipeline record', async () => {
    const task = makeTask(true, 'corr-trigger');
    const trigger = { type: 'app', appIdentifier: 'a1', appName: 'Records', pageId: 'p', runnable: 'save' };
    task.setTrigger(trigger);
    vi.mocked(PipelineRunnerService.startPipeline).mockResolvedValue({ id: 1, identifier: 'p1' } as any);
    vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 2 } as any);

    await task.getPipeline().run();

    expect(PipelineRunnerService.startPipeline).toHaveBeenCalledWith('task-id', [], { trigger });
  });

  describe('requested outputs on taskEnd', () => {
    function taskWithVariables(correlationId: string) {
      const task = makeTask(false, correlationId);
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1')]);
      pipeline.setVariables([
        new Variable({ type: 'object', name: 'rows', value: '{"a":1}', visibility: 'public' } as any),
        new Variable({ type: 'string', name: 'status', value: 'ok', visibility: 'protected' } as any),
        new Variable({ type: 'string', name: 'token', value: 's3cret', visibility: 'public', secret: true } as any),
        new Variable({ type: 'string', name: 'internal', value: 'x' } as any),
      ]);
      return task;
    }

    function taskEndPayload(emitSpy: ReturnType<typeof vi.spyOn>, correlationId: string) {
      return emitSpy.mock.calls.find(([event]) => event === `taskEnd:${correlationId}`)?.[1] as any;
    }

    it('omits `outputs` entirely when none were requested', async () => {
      const task = taskWithVariables('corr-out-none');
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await task.getPipeline().runClean();

      expect(taskEndPayload(emitSpy, 'corr-out-none')).not.toHaveProperty('outputs');
    });

    it('reports requested non-private, non-secret variables only', async () => {
      const task = taskWithVariables('corr-out');
      task.setRequestedOutputs(['rows', 'status', 'token', 'internal', 'missing']);
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await task.getPipeline().runClean();

      expect(taskEndPayload(emitSpy, 'corr-out').outputs).toEqual({ rows: { a: 1 }, status: 'ok' });
    });

    it('still reports outputs when the run fails', async () => {
      const task = taskWithVariables('corr-out-fail');
      task.setRequestedOutputs(['status']);
      blockRunSpy.mockRejectedValueOnce(new Error('boom'));
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(task.getPipeline().runClean()).rejects.toThrow('boom');

      expect(taskEndPayload(emitSpy, 'corr-out-fail').outputs).toEqual({ status: 'ok' });
    });
  });

  describe('resume', () => {
    it('reuses the given pipelineId/identifier, sets status to running first, then completed on success', async () => {
      const task = makeTask(true, 'corr-resume');
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1')]);

      vi.mocked(PipelineService.updateStatus).mockResolvedValue({} as any);
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 77 } as any);

      await pipeline.resume(42, 'existing-pipe');

      expect(pipeline.getId()).toBe(42);
      expect(pipeline.getIdentifier()).toBe('existing-pipe');
      expect(PipelineService.updateStatus).toHaveBeenNthCalledWith(1, 42, 'running');
      expect(PipelineService.updateStatus).toHaveBeenNthCalledWith(2, 42, 'completed', {
        finishedAt: expect.any(Date),
      });
      expect(PipelineBlockService.startBlock).toHaveBeenCalledWith(42, ['a1'], null, null);
      expect(PipelineRunnerService.startPipeline).not.toHaveBeenCalled();
    });

    it('marks the pipeline failed and re-throws when the root block fails', async () => {
      const task = makeTask(true, 'corr-resume-fail');
      const pipeline = task.getPipeline();
      pipeline.setActions([makeAction('a1')]);
      vi.mocked(PipelineService.updateStatus).mockResolvedValue({} as any);
      vi.mocked(PipelineBlockService.startBlock).mockResolvedValue({ id: 78 } as any);
      blockRunSpy.mockRejectedValue(new Error('resume boom'));

      await expect(pipeline.resume(43, 'p43')).rejects.toThrow('resume boom');

      expect(PipelineService.updateStatus).toHaveBeenNthCalledWith(1, 43, 'running');
      expect(PipelineService.updateStatus).toHaveBeenNthCalledWith(2, 43, 'failed', {
        finishedAt: expect.any(Date),
        metadata: { reason: 'action_error', message: 'resume boom' },
      });
    });
  });
});

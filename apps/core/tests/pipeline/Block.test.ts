import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/PipelineActionService', () => ({
  PipelineActionService: {
    getByBlock: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock('@database/services/PipelineVariableService', () => ({
  PipelineVariableService: {
    updateValue: vi.fn(),
  },
}));

vi.mock('@database/services/GlobalVariableService', () => ({
  GlobalVariableService: {
    getAll: vi.fn(),
  },
}));

import { Block } from '@pipeline/Block';
import { Task } from '@task/Task';
import { Variable } from '@variable/Variable';
import { coreEvents } from '@engine/CoreEvents';
import { DebugController } from '@engine/DebugController';
import { RunCanceledSignal } from '@utils/errors';
import { PipelineActionService } from '@database/services/PipelineActionService';
import { PipelineVariableService } from '@database/services/PipelineVariableService';
import { GlobalVariableService } from '@database/services/GlobalVariableService';

function makeTask(opts: { shouldSave?: boolean; correlationId?: string } = {}): Task {
  const task = new Task();
  task.setShouldSave(opts.shouldSave ?? false);
  task.setCorrelationId(opts.correlationId ?? 'corr-default');
  task.setIdentifier('task-id');
  return task;
}

type FakeAction = {
  identifier: string;
  disabled: boolean;
  group: string;
  name: string;
  id: number;
  destination: string;
  onError: 'throw' | 'continue';
  execute: ReturnType<typeof vi.fn>;
  getDestination: ReturnType<typeof vi.fn>;
  getParamsPlain: ReturnType<typeof vi.fn>;
  getRawParams: ReturnType<typeof vi.fn>;
  setRawParams: ReturnType<typeof vi.fn>;
  setParams: ReturnType<typeof vi.fn>;
};

function makeFakeAction(
  overrides: Partial<{
    identifier: string;
    disabled: boolean;
    group: string;
    name: string;
    id: number;
    destination: string;
    onError: 'throw' | 'continue';
    rawParams: any;
    result: any;
    execImpl: (task: any, lastResult: any) => any;
  }> = {}
): FakeAction {
  let rawParams = overrides.rawParams ?? {};
  let params = rawParams;
  const execute = overrides.execImpl ? vi.fn(overrides.execImpl) : vi.fn(async () => overrides.result);

  return {
    identifier: overrides.identifier ?? 'action-1',
    disabled: overrides.disabled ?? false,
    group: overrides.group ?? 'group',
    name: overrides.name ?? 'name',
    id: overrides.id ?? 1,
    destination: overrides.destination ?? '',
    onError: overrides.onError ?? 'throw',
    execute,
    getDestination: vi.fn(() => overrides.destination ?? ''),
    getParamsPlain: vi.fn(() => params),
    getRawParams: vi.fn(() => rawParams),
    setRawParams: vi.fn((p: any) => {
      rawParams = p;
    }),
    setParams: vi.fn((p: any) => {
      params = p;
    }),
  };
}

describe('Block', () => {
  beforeEach(() => {
    vi.mocked(PipelineActionService.getByBlock).mockReset();
    // Sensible default so tests that don't care about "already completed"
    // skipping (most of them) don't need to stub this out individually.
    vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([]);
    vi.mocked(PipelineActionService.updateStatus).mockReset();
    vi.mocked(PipelineVariableService.updateValue).mockReset();
    vi.mocked(GlobalVariableService.getAll).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('run — action selection and looping', () => {
    it('skips actions whose identifier is already completed (only queried when shouldSave is true and blockId !== 0)', async () => {
      const task = makeTask({ shouldSave: true });
      const pipeline = task.getPipeline();
      const a1 = makeFakeAction({ identifier: 'a1' });
      const a2 = makeFakeAction({ identifier: 'a2' });
      pipeline.setVariables([]);

      vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([
        { identifier: 'a1', status: 'completed' },
        { identifier: 'a2', status: 'pending' },
      ] as any);
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);

      const block = new Block([a1 as any, a2 as any], task, 5);
      await block.run();

      expect(PipelineActionService.getByBlock).toHaveBeenCalledWith(5);
      expect(a1.execute).not.toHaveBeenCalled();
      expect(a2.execute).toHaveBeenCalledTimes(1);
    });

    it('does not query completed identifiers when shouldSave is false', async () => {
      const task = makeTask({ shouldSave: false });
      const a1 = makeFakeAction({ identifier: 'a1' });
      const block = new Block([a1 as any], task, 5);

      await block.run();

      expect(PipelineActionService.getByBlock).not.toHaveBeenCalled();
      expect(a1.execute).toHaveBeenCalledTimes(1);
    });

    it('does not query completed identifiers when blockId is 0, even if shouldSave is true', async () => {
      const task = makeTask({ shouldSave: true });
      const a1 = makeFakeAction({ identifier: 'a1' });
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);
      const block = new Block([a1 as any], task, 0);

      await block.run();

      expect(PipelineActionService.getByBlock).not.toHaveBeenCalled();
    });

    it('skips disabled actions', async () => {
      const task = makeTask({ shouldSave: false });
      const a1 = makeFakeAction({ identifier: 'a1', disabled: true });
      const a2 = makeFakeAction({ identifier: 'a2' });
      const block = new Block([a1 as any, a2 as any], task, 0);

      await block.run();

      expect(a1.execute).not.toHaveBeenCalled();
      expect(a2.execute).toHaveBeenCalledTimes(1);
    });

    it('stops before the next action once the run is stopped, ending it as canceled', async () => {
      const correlationId = 'corr-debug-stop';
      DebugController.enable(correlationId, false);
      const task = makeTask({ shouldSave: false, correlationId });

      const a1 = makeFakeAction({
        identifier: 'a1',
        execImpl: async () => {
          // Simulate a user-triggered stop that arrives while this action runs.
          coreEvents.emit(`debug:stop:${correlationId}`);
          return 'r1';
        },
      });
      const a2 = makeFakeAction({ identifier: 'a2' });
      const block = new Block([a1 as any, a2 as any], task, 0);

      await expect(block.run()).rejects.toBeInstanceOf(RunCanceledSignal);

      expect(a1.execute).toHaveBeenCalledTimes(1);
      expect(a2.execute).not.toHaveBeenCalled();

      DebugController.cleanup(correlationId);
    });

    it('a cancel says who canceled, and the step it interrupts is canceled without an error event', async () => {
      const correlationId = 'corr-cancel';
      DebugController.enable(correlationId, false);
      const task = makeTask({ shouldSave: true, correlationId });
      vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([]);
      const errors = vi.fn();
      coreEvents.on(`actionError:${correlationId}`, errors);

      // A flow step whose nested block sees the cancel: the signal passes through it.
      const nested = makeFakeAction({
        identifier: 'loop',
        execImpl: async () => {
          coreEvents.emit(`run:cancel:${correlationId}`, { canceledBy: 'ana@acme.com' });
          DebugController.throwIfStopped(correlationId);
        },
      });
      const block = new Block([nested as any], task, 5);

      const error = await block.run().catch((e) => e);
      expect(error).toBeInstanceOf(RunCanceledSignal);
      expect(error.canceledBy).toBe('ana@acme.com');
      expect(PipelineActionService.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        5,
        'loop',
        'canceled',
        expect.objectContaining({ error: 'Canceled by ana@acme.com' })
      );
      expect(errors).not.toHaveBeenCalled();

      coreEvents.off(`actionError:${correlationId}`, errors);
      DebugController.cleanup(correlationId);
    });

    it('a cancel ends a step that is still waiting, marking it canceled', async () => {
      const correlationId = 'corr-cancel-waiting';
      DebugController.enable(correlationId, false);
      const task = makeTask({ shouldSave: true, correlationId });
      vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([]);

      // Waits forever, like a sign-in nobody finishes.
      const waiting = makeFakeAction({ identifier: 'auth', execImpl: () => new Promise(() => {}) });
      const next = makeFakeAction({ identifier: 'next' });
      const block = new Block([waiting as any, next as any], task, 5);

      const running = block.run().catch((e) => e);
      await vi.waitFor(() => expect(waiting.execute).toHaveBeenCalled());
      coreEvents.emit(`run:cancel:${correlationId}`, { canceledBy: 'ana@acme.com' });

      const error = await running;
      expect(error).toBeInstanceOf(RunCanceledSignal);
      expect(error.canceledBy).toBe('ana@acme.com');
      expect(PipelineActionService.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        5,
        'auth',
        'canceled',
        expect.objectContaining({ error: 'Canceled by ana@acme.com' })
      );
      expect(next.execute).not.toHaveBeenCalled();

      DebugController.cleanup(correlationId);
    });

    it('Stop while paused before a step keeps the finished step completed and never runs the next', async () => {
      const correlationId = 'corr-step-stop';
      DebugController.enable(correlationId, true); // stepping
      const task = makeTask({ shouldSave: true, correlationId });
      vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([]);
      // Paused before a1: run it; paused before a2: stop.
      const paused: string[] = [];
      const onPaused = (data: any) => {
        paused.push(data.identifier);
        coreEvents.emit(paused.length === 1 ? `debug:next:${correlationId}` : `debug:stop:${correlationId}`);
      };
      coreEvents.on(`paused:${correlationId}`, onPaused);

      const a1 = makeFakeAction({ identifier: 'a1', result: 'r1' });
      const a2 = makeFakeAction({ identifier: 'a2' });
      const block = new Block([a1 as any, a2 as any], task, 7);

      await expect(block.run()).rejects.toBeInstanceOf(RunCanceledSignal);
      expect(paused).toEqual(['a1', 'a2']);
      const statuses = vi
        .mocked(PipelineActionService.updateStatus)
        .mock.calls.filter(([, , id]) => id === 'a1')
        .map(([, , , status]) => status);
      expect(statuses).toEqual(['running', 'completed']);
      expect(a2.execute).not.toHaveBeenCalled();

      coreEvents.off(`paused:${correlationId}`, onPaused);
      DebugController.cleanup(correlationId);
    });

    it("restores the pipeline's previous context after the loop finishes, even though it sets context per-iteration", async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      pipeline.setCurrentContext(9, 9);

      const a1 = makeFakeAction({ identifier: 'a1' });
      const a2 = makeFakeAction({ identifier: 'a2' });
      const block = new Block([a1 as any, a2 as any], task, 3);

      await block.run();

      expect(pipeline.getCurrentContext()).toEqual([9, 9]);
    });
  });

  describe('executeAction / runAction — persistence and events', () => {
    it('updates status to running then completed (with result) on success when shouldSave is true', async () => {
      const task = makeTask({ shouldSave: true });
      const pipeline = task.getPipeline();
      (pipeline as any).id = 77;
      const action = makeFakeAction({ identifier: 'act1', group: 'g', name: 'n', result: 'the-result' });
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);

      const block = new Block([action as any], task, 5);
      await block.run();

      expect(PipelineActionService.updateStatus).toHaveBeenNthCalledWith(
        1,
        77,
        5,
        'act1',
        'running',
        { startedAt: expect.any(Date) }
      );
      expect(PipelineActionService.updateStatus).toHaveBeenNthCalledWith(
        2,
        77,
        5,
        'act1',
        'completed',
        { result: 'the-result', params: {}, finishedAt: expect.any(Date) }
      );
    });

    it('updates status to failed (with error) when the action throws, emits actionError, and re-throws', async () => {
      const task = makeTask({ shouldSave: true, correlationId: 'corr-fail-1' });
      const pipeline = task.getPipeline();
      (pipeline as any).id = 88;
      const boom = new Error('kaboom');
      const action = makeFakeAction({
        identifier: 'act-fail',
        group: 'g',
        name: 'n',
        execImpl: async () => {
          throw boom;
        },
      });
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 6);
      await expect(block.run()).rejects.toThrow('kaboom');

      expect(PipelineActionService.updateStatus).toHaveBeenNthCalledWith(
        2,
        88,
        6,
        'act-fail',
        'failed',
        { error: 'kaboom', params: {}, finishedAt: expect.any(Date) }
      );
      expect(emitSpy).toHaveBeenCalledWith(
        'actionError:corr-fail-1',
        expect.objectContaining({ identifier: 'act-fail', name: 'g.n', error: 'kaboom' })
      );
    });

    it('names the run and workflow on actionError, like the action event', async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-fail-ids' });
      (task.getPipeline() as any).identifier = 'run-ids';
      const action = makeFakeAction({
        identifier: 'act-ids',
        execImpl: async () => {
          throw new Error('nope');
        },
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      await expect(new Block([action as any], task, 6).run()).rejects.toThrow('nope');

      const call = emitSpy.mock.calls.find(([event]) => event === 'actionError:corr-fail-ids');
      expect(call?.[1]).toMatchObject({ pipelineIdentifier: 'run-ids', taskIdentifier: 'task-id' });
    });

    it('does not persist status when shouldSave is false, but still executes and re-throws on failure', async () => {
      const task = makeTask({ shouldSave: false });
      const boom = new Error('no-save-boom');
      const action = makeFakeAction({
        identifier: 'a1',
        execImpl: async () => {
          throw boom;
        },
      });
      const block = new Block([action as any], task, 0);

      await expect(block.run()).rejects.toThrow('no-save-boom');
      expect(PipelineActionService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('runAction — result -> destination variable', () => {
    it('writes the result to the destination variable when getDestination() is set and result is non-null', async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      const destVar = new Variable({ type: 'string', name: 'outVar', value: '' } as any);
      pipeline.setVariables([destVar]);
      const action = makeFakeAction({ identifier: 'a1', destination: 'outVar', result: 'produced' });
      const block = new Block([action as any], task, 0);

      await block.run();

      expect(destVar.getValue()).toBe('produced');
    });

    it('stops before the action runs when the destination variable does not exist', async () => {
      const task = makeTask({ shouldSave: false });
      const action = makeFakeAction({ identifier: 'a1', destination: 'missing', result: 'produced' });
      const block = new Block([action as any], task, 0);

      await expect(block.run()).rejects.toThrow('destination "missing" does not exist');
      expect(action.execute).not.toHaveBeenCalled();
    });

    it('still runs an action with no destination', async () => {
      const task = makeTask({ shouldSave: false });
      const action = makeFakeAction({ identifier: 'a1', result: 'produced' });
      const block = new Block([action as any], task, 0);

      await block.run();

      expect(action.execute).toHaveBeenCalled();
    });

    it('does not touch the destination variable when the result is null', async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      const destVar = new Variable({ type: 'string', name: 'outVar', value: 'unchanged' } as any);
      pipeline.setVariables([destVar]);
      const action = makeFakeAction({ identifier: 'a1', destination: 'outVar', result: null });
      const block = new Block([action as any], task, 0);

      await block.run();

      expect(destVar.getValue()).toBe('unchanged');
    });

    it('propagates the error when setValue throws and action.onError is "throw"', async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      const destVar = new Variable({ type: 'string', name: 'outVar', value: '', readonly: true } as any);
      pipeline.setVariables([destVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        destination: 'outVar',
        result: 'produced',
        onError: 'throw',
      });
      const block = new Block([action as any], task, 0);

      await expect(block.run()).rejects.toThrow(
        'Variable "outVar" is readonly and cannot be modified.'
      );
    });

    it('swallows the setValue error and skips persistence when onError is not "throw"', async () => {
      const task = makeTask({ shouldSave: true });
      const pipeline = task.getPipeline();
      (pipeline as any).id = 5;
      const destVar = new Variable({ type: 'string', name: 'outVar', value: '', readonly: true } as any);
      pipeline.setVariables([destVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        destination: 'outVar',
        result: 'produced',
        onError: 'continue',
      });
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);
      const block = new Block([action as any], task, 3);

      await expect(block.run()).resolves.toBeUndefined();

      expect(destVar.getValue()).toBe('');
      expect(PipelineVariableService.updateValue).not.toHaveBeenCalled();
    });

    it('nulls out the persisted and broadcast result for non-serializable destination variable types', async () => {
      const task = makeTask({ shouldSave: true, correlationId: 'corr-nonser' });
      const pipeline = task.getPipeline();
      (pipeline as any).id = 9;
      const destVar = new Variable({ type: 'browser', name: 'browserVar', required: false } as any);
      pipeline.setVariables([destVar]);
      const fakeBrowserHandle = {
        close: vi.fn(),
        newPage: vi.fn(),
        pages: vi.fn(),
        version: vi.fn(),
      };
      const action = makeFakeAction({
        identifier: 'a1',
        destination: 'browserVar',
        result: fakeBrowserHandle,
      });
      vi.mocked(PipelineActionService.updateStatus).mockResolvedValue(1 as any);
      vi.mocked(PipelineVariableService.updateValue).mockResolvedValue(1 as any);
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 4);
      await block.run();

      expect(destVar.getValue()).toBe(fakeBrowserHandle);
      expect(PipelineVariableService.updateValue).toHaveBeenCalledWith(
        9,
        'browserVar',
        null,
        { blockId: 4, scope: 'task', type: 'browser' },
        { sensitive: false }
      );
      const actionEventCall = emitSpy.mock.calls.find(([event]) => event === 'action:corr-nonser');
      expect(actionEventCall?.[1].result).toBeNull();
    });

    it('does not call PipelineVariableService.updateValue when shouldSave is false, even with a destination set', async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      const destVar = new Variable({ type: 'string', name: 'outVar', value: '' } as any);
      pipeline.setVariables([destVar]);
      const action = makeFakeAction({ identifier: 'a1', destination: 'outVar', result: 'produced' });
      const block = new Block([action as any], task, 0);

      await block.run();

      expect(PipelineVariableService.updateValue).not.toHaveBeenCalled();
    });
  });

  describe('updateActionParams', () => {
    it('always resolves from a fresh safeClone of rawParams, not from mutated previous params', async () => {
      const task = makeTask({ shouldSave: false });
      const pipeline = task.getPipeline();
      const nameVar = new Variable({ type: 'string', name: 'name', value: 'Alice' } as any);
      pipeline.setVariables([nameVar]);

      const rawParams = { greeting: '{= name =}' };
      const action = makeFakeAction({ identifier: 'a1', rawParams, result: 'ok' });
      const block = new Block([action as any], task, 0);

      await (block as any).runAction(action);
      expect(action.setParams).toHaveBeenNthCalledWith(1, { greeting: 'Alice' });

      nameVar.setValue('Bob');
      await (block as any).runAction(action);
      expect(action.setParams).toHaveBeenNthCalledWith(2, { greeting: 'Bob' });

      expect(action.getRawParams).toHaveBeenCalledTimes(2);
    });

    it('does not query GlobalVariableService when params have no "_global." reference', async () => {
      const task = makeTask({ shouldSave: false });
      const action = makeFakeAction({ identifier: 'a1', rawParams: { msg: 'hello' }, result: 'ok' });
      const block = new Block([action as any], task, 0);

      await (block as any).runAction(action);

      expect(GlobalVariableService.getAll).not.toHaveBeenCalled();
    });

    it('queries GlobalVariableService.getAll when params reference "_global."', async () => {
      vi.mocked(GlobalVariableService.getAll).mockResolvedValue([
        { name: 'apiKey', value: 'secret-key' },
      ] as any);
      const task = makeTask({ shouldSave: false });
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: { msg: '{= _global.apiKey =}' },
        result: 'ok',
      });
      const block = new Block([action as any], task, 0);

      await (block as any).runAction(action);

      expect(GlobalVariableService.getAll).toHaveBeenCalledTimes(1);
      expect(action.setParams).toHaveBeenCalledWith({ msg: 'secret-key' });
    });

    it('resolves "{{ _previous.field }}" in the next action from the prior action\'s result', async () => {
      const task = makeTask({ shouldSave: false });
      const first = makeFakeAction({
        identifier: 'a1',
        rawParams: {},
        result: { myField: 'hello' },
      });
      const second = makeFakeAction({
        identifier: 'a2',
        rawParams: { msg: 'Got: {{ _previous.myField }}' },
        result: 'ok',
      });
      const block = new Block([first as any, second as any], task, 0);

      await block.run();

      expect(second.setParams).toHaveBeenCalledWith({ msg: 'Got: hello' });
    });

    it('resolves "{= _previous.field =}" to the prior action\'s result, preserving type', async () => {
      const task = makeTask({ shouldSave: false });
      const first = makeFakeAction({
        identifier: 'a1',
        rawParams: {},
        result: { count: 42 },
      });
      const second = makeFakeAction({
        identifier: 'a2',
        rawParams: { n: '{= _previous.count =}' },
        result: 'ok',
      });
      const block = new Block([first as any, second as any], task, 0);

      await block.run();

      expect(second.setParams).toHaveBeenCalledWith({ n: 42 });
    });

    it('has no previous result for the first action in the block', async () => {
      const task = makeTask({ shouldSave: false });
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: { msg: 'Got: {{ _previous.myField }}' },
        result: 'ok',
      });
      const block = new Block([action as any], task, 0);

      await block.run();

      expect(action.setParams).toHaveBeenCalledWith({ msg: 'Got: ' });
    });
  });

  describe('secret redaction', () => {
    it('redacts a secret variable\'s value from broadcast params by identity, but does not redact a non-secret variable that merely shares the same literal value', async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-redact-1' });
      const pipeline = task.getPipeline();
      const secretVar = new Variable({ type: 'string', name: 'secretVar', value: 'SECRET123', secret: true } as any);
      const plainVar = new Variable({ type: 'string', name: 'plainVar', value: 'SECRET123' } as any);
      pipeline.setVariables([secretVar, plainVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: { a: '{= secretVar =}', b: '{= plainVar =}' },
        result: 'ok',
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 0);
      await block.run();

      const actionEventCall = emitSpy.mock.calls.find(([event]) => event === 'action:corr-redact-1');
      expect(actionEventCall?.[1].params).toEqual({ a: '[REDACTED]', b: 'SECRET123' });
    });

    it('redacts a secret value found inside a larger error message (value-scan) when an action throws', async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-redact-2' });
      const pipeline = task.getPipeline();
      const secretVar = new Variable({ type: 'string', name: 'secretVar', value: 'TOPSECRET', secret: true } as any);
      pipeline.setVariables([secretVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        execImpl: async () => {
          throw new Error('failed for value TOPSECRET');
        },
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 0);
      await expect(block.run()).rejects.toThrow('failed for value TOPSECRET');

      const errorEventCall = emitSpy.mock.calls.find(([event]) => event === 'actionError:corr-redact-2');
      expect(errorEventCall?.[1].error).toBe('failed for value [REDACTED]');
    });

    it("reuses the matching already-redacted displayParams field when the result echoes one of the action's own resolved params", async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-redact-3' });
      const pipeline = task.getPipeline();
      const secretVar = new Variable({ type: 'string', name: 'secretVar', value: 'TOPSECRET', secret: true } as any);
      const plainVar = new Variable({ type: 'string', name: 'plainVar', value: 'TOPSECRET' } as any);
      pipeline.setVariables([secretVar, plainVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: { message: '{= secretVar =}', other: '{= plainVar =}' },
        execImpl: async () => 'TOPSECRET',
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 0);
      await block.run();

      const actionEventCall = emitSpy.mock.calls.find(([event]) => event === 'action:corr-redact-3');
      expect(actionEventCall?.[1].result).toBe('[REDACTED]');
    });

    it("falls back to a value-scan redaction of the result when it doesn't echo any of the action's own params", async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-redact-4' });
      const pipeline = task.getPipeline();
      const secretVar = new Variable({ type: 'string', name: 'secretVar', value: 'TOPSECRET', secret: true } as any);
      pipeline.setVariables([secretVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: {},
        execImpl: async () => 'wrapped-TOPSECRET-here',
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 0);
      await block.run();

      const actionEventCall = emitSpy.mock.calls.find(([event]) => event === 'action:corr-redact-4');
      expect(actionEventCall?.[1].result).toBe('wrapped-[REDACTED]-here');
    });

    it('returns getParamsPlain() directly (skips the redaction re-render) when no variable is secret', async () => {
      const task = makeTask({ shouldSave: false, correlationId: 'corr-redact-5' });
      const pipeline = task.getPipeline();
      const plainVar = new Variable({ type: 'string', name: 'plainVar', value: 'hello' } as any);
      pipeline.setVariables([plainVar]);
      const action = makeFakeAction({
        identifier: 'a1',
        rawParams: { msg: '{= plainVar =}' },
        result: 'ok',
      });
      const emitSpy = vi.spyOn(coreEvents, 'emit');

      const block = new Block([action as any], task, 0);
      await block.run();

      const actionEventCall = emitSpy.mock.calls.find(([event]) => event === 'action:corr-redact-5');
      expect(actionEventCall?.[1].params).toEqual({ msg: 'hello' });
    });
  });
});

describe('Block — debugger', () => {
  const ids: string[] = [];
  function debugRun(name: string, stepping: boolean, options: { breakpoints?: string[] } = {}) {
    const correlationId = `corr-${name}`;
    ids.push(correlationId);
    DebugController.enable(correlationId, stepping, { debugMode: true, ...options });
    const task = makeTask({ shouldSave: false, correlationId });
    const events: Array<{ type: string; data: any }> = [];
    for (const type of ['paused', 'action', 'actionError']) {
      coreEvents.on(`${type}:${correlationId}`, (data: any) => events.push({ type, data }));
    }
    // Answers each pause with the next decision from `answers` (command or plain event).
    const answer = (answers: Array<string | { command: string; [k: string]: unknown }>) => {
      coreEvents.on(`paused:${correlationId}`, () => {
        const next = answers.shift();
        if (!next) return;
        setTimeout(() => {
          if (typeof next === 'string') coreEvents.emit(`debug:${next}:${correlationId}`);
          else coreEvents.emit(`debug:command:${correlationId}`, next);
        });
      });
    };
    return { correlationId, task, events, answer };
  }

  beforeEach(() => {
    vi.mocked(PipelineActionService.getByBlock).mockResolvedValue([]);
  });

  afterEach(() => {
    for (const id of ids.splice(0)) {
      coreEvents.removeAllListeners(`paused:${id}`);
      coreEvents.removeAllListeners(`action:${id}`);
      coreEvents.removeAllListeners(`actionError:${id}`);
      DebugController.cleanup(id);
    }
  });

  it('pauses before each step with its input filled in', async () => {
    const { task, events, answer } = debugRun('before', true);
    const pipeline = task.getPipeline();
    const name = new Variable({ name: 'who', type: 'string', value: 'Sam' } as any);
    pipeline.setVariables([name]);
    answer(['next', 'next']);
    const a1 = makeFakeAction({ identifier: 'a1', rawParams: { to: '{{ who }}' } });
    const a2 = makeFakeAction({ identifier: 'a2' });

    await new Block([a1 as any, a2 as any], task, 0).run();

    const paused = events.filter((e) => e.type === 'paused');
    expect(paused.map((e) => e.data.identifier)).toEqual(['a1', 'a2']);
    expect(paused[0].data.params).toEqual({ to: 'Sam' });
    // Paused before a1, then a1 ran, then paused before a2.
    expect(events.map((e) => `${e.type}:${e.data.identifier}`)).toEqual([
      'paused:a1',
      'action:a1',
      'paused:a2',
      'action:a2',
    ]);
  });

  it('leaves out a step the debugger skips, reported as skipped', async () => {
    const { task, events, answer } = debugRun('skip', true);
    answer([{ command: 'skip' }, 'next']);
    const a1 = makeFakeAction({ identifier: 'a1' });
    const a2 = makeFakeAction({ identifier: 'a2' });

    await new Block([a1 as any, a2 as any], task, 0).run();

    expect(a1.execute).not.toHaveBeenCalled();
    expect(a2.execute).toHaveBeenCalledTimes(1);
    expect(events.find((e) => e.type === 'action' && e.data.identifier === 'a1')?.data.skipped).toBe(true);
  });

  it('stops at a breakpoint while running, and only there', async () => {
    const { task, events, answer } = debugRun('breakpoint', false, { breakpoints: ['a2'] });
    answer(['run']);
    const steps = ['a1', 'a2', 'a3'].map((identifier) => makeFakeAction({ identifier }));

    await new Block(steps as any, task, 0).run();

    expect(events.filter((e) => e.type === 'paused').map((e) => e.data.identifier)).toEqual(['a2']);
    steps.forEach((step) => expect(step.execute).toHaveBeenCalledTimes(1));
  });

  it('Next pass runs the rest of the block it was paused in, then pauses again', async () => {
    const { correlationId, task, events, answer } = debugRun('next-pass', true);
    // Paused before "outer" (it runs an inner block), then before "inner1": Next pass
    // runs inner1 and inner2 without pausing, then pauses before "after".
    answer(['next', { command: 'nextPass' }, 'next']);
    const inner1 = makeFakeAction({ identifier: 'inner1' });
    const inner2 = makeFakeAction({ identifier: 'inner2' });
    const outer = makeFakeAction({
      identifier: 'outer',
      execImpl: async () => new Block([inner1 as any, inner2 as any], task, 0).run(),
    });
    const after = makeFakeAction({ identifier: 'after' });

    await new Block([outer as any, after as any], task, 0).run();

    expect(events.filter((e) => e.type === 'paused').map((e) => e.data.identifier)).toEqual(['outer', 'inner1', 'after']);
    expect(inner2.execute).toHaveBeenCalledTimes(1);
    expect(DebugController.isStepping(correlationId)).toBe(true);
  });

  /** A sub-workflow of `task`: same run (correlation id), one call deeper. */
  function subWorkflow(task: Task, identifier: string) {
    const child = makeTask({ shouldSave: false, correlationId: task.getCorrelationId() });
    child.setIdentifier(identifier);
    child.setCallStack([identifier]);
    return child;
  }

  it('Step over runs the step it waits at (a sub-workflow) to its end, then pauses', async () => {
    const { task, events, answer } = debugRun('step-over', true);
    // Paused before "call": Step over runs the sub-workflow's steps without pausing.
    answer([{ command: 'stepOver' }, 'next']);
    const child = subWorkflow(task, 'enrich');
    const inner1 = makeFakeAction({ identifier: 'inner1' });
    const inner2 = makeFakeAction({ identifier: 'inner2' });
    const call = makeFakeAction({
      identifier: 'call',
      execImpl: async () => new Block([inner1 as any, inner2 as any], child, 0).run(),
    });
    const after = makeFakeAction({ identifier: 'after' });

    await new Block([call as any, after as any], task, 0).run();

    expect(events.filter((e) => e.type === 'paused').map((e) => e.data.identifier)).toEqual(['call', 'after']);
    expect(inner1.execute).toHaveBeenCalledTimes(1);
    expect(inner2.execute).toHaveBeenCalledTimes(1);
  });

  it('Next steps into a sub-workflow, and Step out runs the rest of it', async () => {
    const { task, events, answer } = debugRun('step-out', true);
    // Before "call", Next; before "inner1" (inside), Step out: inner2 runs without a pause.
    answer(['next', { command: 'stepOut' }, 'next']);
    const child = subWorkflow(task, 'enrich');
    const inner1 = makeFakeAction({ identifier: 'inner1' });
    const inner2 = makeFakeAction({ identifier: 'inner2' });
    const call = makeFakeAction({
      identifier: 'call',
      execImpl: async () => new Block([inner1 as any, inner2 as any], child, 0).run(),
    });
    const after = makeFakeAction({ identifier: 'after' });

    await new Block([call as any, after as any], task, 0).run();

    const paused = events.filter((e) => e.type === 'paused');
    expect(paused.map((e) => e.data.identifier)).toEqual(['call', 'inner1', 'after']);
    // How deep each pause was: the workflow's own steps, then inside the sub-workflow.
    expect(paused.map((e) => e.data.callDepth)).toEqual([0, 1, 0]);
    expect(inner2.execute).toHaveBeenCalledTimes(1);
  });

  it('stops at a breakpoint inside a sub-workflow, named with its workflow', async () => {
    const { task, events, answer } = debugRun('sub-breakpoint', false, { breakpoints: ['enrich:inner2'] });
    answer(['run']);
    const child = subWorkflow(task, 'enrich');
    const inner = ['inner1', 'inner2'].map((identifier) => makeFakeAction({ identifier }));
    const call = makeFakeAction({
      identifier: 'call',
      execImpl: async () => new Block(inner as any, child, 0).run(),
    });
    // The same step identifier in the calling workflow doesn't stop.
    const sameId = makeFakeAction({ identifier: 'inner2' });

    await new Block([call as any, sameId as any], task, 0).run();

    expect(events.filter((e) => e.type === 'paused').map((e) => `${e.data.taskIdentifier}:${e.data.identifier}`)).toEqual([
      'enrich:inner2',
    ]);
  });

  it('runs a step with settings edited while paused, and shows its new input', async () => {
    const { task, events, answer } = debugRun('edit', true);
    answer([{ command: 'updateStep', identifier: 'a1', params: { to: 'new@acme.com' } }, 'next']);
    const a1 = makeFakeAction({ identifier: 'a1', rawParams: { to: 'old@acme.com' } });

    await new Block([a1 as any], task, 0).run();

    const paused = events.filter((e) => e.type === 'paused');
    expect(paused.map((e) => e.data.params)).toEqual([{ to: 'old@acme.com' }, { to: 'new@acme.com' }]);
    expect(a1.setRawParams).toHaveBeenCalledWith({ to: 'new@acme.com' });
    expect(a1.getParamsPlain()).toEqual({ to: 'new@acme.com' });
  });

  it('sets a variable while paused and fills the step’s input in again', async () => {
    const { task, events, answer } = debugRun('set-var', true);
    task.getPipeline().setVariables([new Variable({ name: 'who', type: 'string', value: 'Sam' } as any)]);
    answer([{ command: 'setVariable', name: 'who', value: 'Ana' }, 'next']);
    const a1 = makeFakeAction({ identifier: 'a1', rawParams: { to: '{{ who }}' } });

    await new Block([a1 as any], task, 0).run();

    const paused = events.filter((e) => e.type === 'paused');
    expect(paused[1].data.params).toEqual({ to: 'Ana' });
    expect(paused[1].data.changedVariables).toEqual([{ name: 'who', value: 'Ana' }]);
    expect(a1.getParamsPlain()).toEqual({ to: 'Ana' });
  });

  it('waits at a failed step: run it again and go on', async () => {
    const { task, events, answer } = debugRun('retry', false);
    answer([{ command: 'retry' }]);
    let calls = 0;
    const a1 = makeFakeAction({
      identifier: 'a1',
      execImpl: async () => {
        calls++;
        if (calls === 1) throw new Error('UNIQUE constraint failed');
        return 'ok';
      },
    });
    const a2 = makeFakeAction({ identifier: 'a2' });

    await new Block([a1 as any, a2 as any], task, 0).run();

    expect(a1.execute).toHaveBeenCalledTimes(2);
    expect(a2.execute).toHaveBeenCalledTimes(1);
    const paused = events.find((e) => e.type === 'paused');
    expect(paused?.data).toMatchObject({ identifier: 'a1', failed: true, error: 'UNIQUE constraint failed' });
  });

  it('waits at a failed step: skip it and go on', async () => {
    const { task, answer } = debugRun('fail-skip', false);
    answer([{ command: 'skip' }]);
    const a1 = makeFakeAction({ identifier: 'a1', execImpl: async () => { throw new Error('boom'); } });
    const a2 = makeFakeAction({ identifier: 'a2' });

    await new Block([a1 as any, a2 as any], task, 0).run();
    expect(a2.execute).toHaveBeenCalledTimes(1);
  });

  it('lets a failed step fail the run on Continue, pausing once even when nested', async () => {
    const { task, events, answer } = debugRun('fail-through', false);
    answer(['run']);
    const inner = makeFakeAction({ identifier: 'inner', execImpl: async () => { throw new Error('boom'); } });
    const outer = makeFakeAction({
      identifier: 'outer',
      execImpl: async () => new Block([inner as any], task, 0).run(),
    });

    await expect(new Block([outer as any], task, 0).run()).rejects.toThrow('boom');
    expect(events.filter((e) => e.type === 'paused').map((e) => e.data.identifier)).toEqual(['inner']);
  });

  it('a failed step outside the debugger ends the run right away', async () => {
    const correlationId = 'corr-not-debugging';
    ids.push(correlationId);
    DebugController.enable(correlationId, false);
    const task = makeTask({ shouldSave: false, correlationId });
    const paused = vi.fn();
    coreEvents.on(`paused:${correlationId}`, paused);
    const a1 = makeFakeAction({ identifier: 'a1', execImpl: async () => { throw new Error('boom'); } });

    await expect(new Block([a1 as any], task, 0).run()).rejects.toThrow('boom');
    expect(paused).not.toHaveBeenCalled();
  });
});

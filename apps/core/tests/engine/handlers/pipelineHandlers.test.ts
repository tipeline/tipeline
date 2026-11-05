import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    pipelineList: vi.fn(),
    pipelineDetail: vi.fn(),
    pipelineStats: vi.fn(),
    pipelineResume: vi.fn(),
    pipelineCancel: vi.fn(),
  },
}));

const bindMock = vi.fn();
const unbindMock = vi.fn();
const TaskStreamListenerCtor = vi.fn();
vi.mock('@engine/TaskStreamListener', () => ({
  TaskStreamListener: class {
    constructor(...args: any[]) {
      TaskStreamListenerCtor(...args);
    }
    bind = bindMock;
    unbind = unbindMock;
  },
}));

import { registerPipelineHandlers } from '@engine/handlers/pipelineHandlers';
import Core from '@engine/Core';
import IPCMessage from '@engine/IPCMessage';

function createFakeTransport() {
  const handlers = new Map<string, (message: any, client: any) => void>();
  return {
    on: vi.fn((event: string, handler: any) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn(),
    broadcast: vi.fn(),
    stop: vi.fn(),
    handlers,
  };
}

describe('pipelineHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  let broadcast: ReturnType<typeof vi.fn>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.pipelineList).mockReset();
    vi.mocked(Core.pipelineDetail).mockReset();
    vi.mocked(Core.pipelineStats).mockReset();
    vi.mocked(Core.pipelineResume).mockReset();
    vi.mocked(Core.pipelineCancel).mockReset();
    bindMock.mockReset();
    unbindMock.mockReset();
    TaskStreamListenerCtor.mockReset();
    transport = createFakeTransport();
    broadcast = vi.fn();
    registerPipelineHandlers(transport as any, broadcast);
  });

  describe('pipelineStats', () => {
    it('passes the boundaries to Core and answers with the counts', async () => {
      const counts = [{ from: 'a', to: 'b', total: 3, failed: 1 }];
      vi.mocked(Core.pipelineStats).mockResolvedValue(counts as any);
      const message = { payload: { boundaries: ['a', 'b'] }, correlationId: 'corr-s' };

      await transport.handlers.get('pipelineStats')!(message, client);

      expect(Core.pipelineStats).toHaveBeenCalledWith(['a', 'b']);
      expect(transport.emit).toHaveBeenCalledWith(client, 'onPipelineStats', IPCMessage.success(counts, 'corr-s'));
    });

    it('answers with a failure when Core refuses the boundaries', async () => {
      vi.mocked(Core.pipelineStats).mockRejectedValue(new Error('boundaries must be a list of ISO dates'));
      await transport.handlers.get('pipelineStats')!({ payload: {}, correlationId: 'corr-s' }, client);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineStats',
        IPCMessage.failure('boundaries must be a list of ISO dates', 'corr-s')
      );
    });
  });

  describe('pipelineList', () => {
    it('resolves with the pipeline list on success', async () => {
      const sample = [{ identifier: 'p1' }];
      vi.mocked(Core.pipelineList).mockResolvedValue(sample as any);
      const message = { payload: { taskIdentifier: 'task-1' }, correlationId: 'corr-1' };

      await transport.handlers.get('pipelineList')!(message, client);

      expect(Core.pipelineList).toHaveBeenCalledWith('task-1', undefined, undefined, undefined);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('passes a status filter through to Core', async () => {
      vi.mocked(Core.pipelineList).mockResolvedValue([]);
      const message = {
        payload: { limit: 30, offset: 0, status: 'failed' },
        correlationId: 'corr-st',
      };

      await transport.handlers.get('pipelineList')!(message, client);

      expect(Core.pipelineList).toHaveBeenCalledWith(undefined, 30, 0, 'failed');
    });

    it('emits a failure message when Core.pipelineList rejects', async () => {
      vi.mocked(Core.pipelineList).mockRejectedValue(new Error('boom'));
      const message = { payload: { taskIdentifier: 'task-1' }, correlationId: 'corr-1' };

      await transport.handlers.get('pipelineList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pipelineList')!(
        { payload: { taskIdentifier: 'task-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pipelineList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pipelineDetail', () => {
    it('resolves with the pipeline detail on success', async () => {
      const sample = { identifier: 'p1' };
      vi.mocked(Core.pipelineDetail).mockResolvedValue(sample as any);
      const message = { payload: { pipelineIdentifier: 'p1' }, correlationId: 'corr-2' };

      await transport.handlers.get('pipelineDetail')!(message, client);

      expect(Core.pipelineDetail).toHaveBeenCalledWith('p1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineDetail',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.pipelineDetail rejects', async () => {
      vi.mocked(Core.pipelineDetail).mockRejectedValue(new Error('boom'));
      const message = { payload: { pipelineIdentifier: 'p1' }, correlationId: 'corr-2' };

      await transport.handlers.get('pipelineDetail')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineDetail',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pipelineDetail')!(
        { payload: { pipelineIdentifier: 'p1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pipelineDetail).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pipelineResume', () => {
    it('binds a TaskStreamListener, resumes the pipeline, and broadcasts onTaskEndAll on success', async () => {
      vi.mocked(Core.pipelineResume).mockResolvedValue(undefined as any);
      const message = {
        payload: { pipelineIdentifier: 'p1', variables: { a: 1 } },
        correlationId: 'corr-3',
      };

      await transport.handlers.get('pipelineResume')!(message, client);

      expect(TaskStreamListenerCtor).toHaveBeenCalledWith('corr-3', broadcast);
      expect(bindMock).toHaveBeenCalledTimes(1);
      expect(Core.pipelineResume).toHaveBeenCalledWith('p1', 'corr-3', { a: 1 });
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success('Workflow finished successfully', 'corr-3')
      );
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(transport.emit).not.toHaveBeenCalled();
    });

    it('defaults variables to an empty object when payload.variables is missing', async () => {
      vi.mocked(Core.pipelineResume).mockResolvedValue(undefined as any);
      const message = { payload: { pipelineIdentifier: 'p1' }, correlationId: 'corr-3' };

      await transport.handlers.get('pipelineResume')!(message, client);

      expect(Core.pipelineResume).toHaveBeenCalledWith('p1', 'corr-3', {});
    });

    it('broadcasts onTaskError and still unbinds when Core.pipelineResume rejects', async () => {
      vi.mocked(Core.pipelineResume).mockRejectedValue(new Error('boom'));
      const message = { payload: { pipelineIdentifier: 'p1' }, correlationId: 'corr-3' };

      await transport.handlers.get('pipelineResume')!(message, client);

      expect(broadcast).toHaveBeenCalledWith('onTaskError', IPCMessage.failure('boom', 'corr-3'));
      expect(unbindMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pipelineResume')!(
        { payload: { pipelineIdentifier: 'p1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pipelineResume).not.toHaveBeenCalled();
      expect(TaskStreamListenerCtor).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('pipelineCancel', () => {
    it('passes the payload to Core.pipelineCancel and answers with how it went', async () => {
      vi.mocked(Core.pipelineCancel).mockResolvedValue({ status: 'canceling' });
      const payload = { pipelineIdentifier: 'p-1', canceledBy: 'ana' };

      await transport.handlers.get('pipelineCancel')!({ payload, correlationId: 'c' }, client);

      expect(Core.pipelineCancel).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineCancel',
        IPCMessage.success({ status: 'canceling' }, 'c')
      );
    });

    it('announces the end of a run it canceled right away (one waiting for approval)', async () => {
      vi.mocked(Core.pipelineCancel).mockResolvedValue({
        status: 'canceled',
        pipelineIdentifier: 'p-9',
        taskIdentifier: 'wf-pay',
      });
      await transport.handlers.get('pipelineCancel')!({ payload: { pipelineIdentifier: 'p-9' }, correlationId: 'c' }, client);

      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEnd',
        expect.objectContaining({
          success: true,
          data: { pipelineIdentifier: 'p-9', taskIdentifier: 'wf-pay', status: 'canceled' },
        })
      );
    });

    it('announces nothing when the job was only asked to stop (it ends by itself)', async () => {
      vi.mocked(Core.pipelineCancel).mockResolvedValue({ status: 'canceling' });
      await transport.handlers.get('pipelineCancel')!({ payload: { correlationId: 'r' }, correlationId: 'c' }, client);
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('answers with the error when it fails', async () => {
      vi.mocked(Core.pipelineCancel).mockRejectedValue(new Error('Run not found'));
      await transport.handlers.get('pipelineCancel')!({ payload: {}, correlationId: 'c' }, client);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPipelineCancel',
        IPCMessage.failure('Run not found', 'c')
      );
    });
  });
});

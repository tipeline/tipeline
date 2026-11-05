import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    appNew: vi.fn(),
    appList: vi.fn(),
    appDetail: vi.fn(),
    appUpdateSource: vi.fn(),
    appUninstall: vi.fn(),
    appInstall: vi.fn(),
    appExport: vi.fn(),
    tableDataFetch: vi.fn(),
    appHistoryFetch: vi.fn(),
    appRun: vi.fn(),
  },
}));

import { registerAppHandlers } from '@engine/handlers/appHandlers';
import Core from '@engine/Core';
import IPCMessage from '@engine/IPCMessage';
import { coreEvents } from '@engine/CoreEvents';
import { ActionError } from '@utils/ActionError';

/** Builds a fake transport that captures registered handlers by event name. */
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

describe('appHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };
  const broadcast = vi.fn();

  beforeEach(() => {
    vi.mocked(Core.appNew).mockReset();
    vi.mocked(Core.appList).mockReset();
    vi.mocked(Core.appDetail).mockReset();
    vi.mocked(Core.appUpdateSource).mockReset();
    vi.mocked(Core.appUninstall).mockReset();
    vi.mocked(Core.appInstall).mockReset();
    vi.mocked(Core.appExport).mockReset();
    vi.mocked(Core.tableDataFetch).mockReset();
    vi.mocked(Core.appHistoryFetch).mockReset();
    vi.mocked(Core.appRun).mockReset();
    broadcast.mockReset();
    transport = createFakeTransport();
    registerAppHandlers(transport as any, broadcast);
  });

  describe('appNew', () => {
    it('resolves with the new app on success', async () => {
      const sample = { identifier: 'app-1' };
      vi.mocked(Core.appNew).mockResolvedValue(sample as any);
      const message = { payload: { data: { name: 'My App' } }, correlationId: 'corr-1' };

      await transport.handlers.get('appNew')!(message, client);

      expect(Core.appNew).toHaveBeenCalledWith({ name: 'My App' });
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppNew',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.appNew rejects', async () => {
      vi.mocked(Core.appNew).mockRejectedValue(new Error('boom'));
      const message = { payload: { data: {} }, correlationId: 'corr-1' };

      await transport.handlers.get('appNew')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppNew',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      const message = { payload: { data: {} }, correlationId: 'corr-1' };

      await transport.handlers.get('appNew')!(message, undefined);

      expect(Core.appNew).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appList', () => {
    it('resolves with the app list on success', async () => {
      const sample = [{ identifier: 'app-1' }];
      vi.mocked(Core.appList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-2' };

      await transport.handlers.get('appList')!(message, client);

      expect(Core.appList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppList',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.appList rejects', async () => {
      vi.mocked(Core.appList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-2' };

      await transport.handlers.get('appList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppList',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appList')!({ payload: {}, correlationId: 'x' }, null);

      expect(Core.appList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appDetail', () => {
    it('resolves with the app detail on success', async () => {
      const sample = { identifier: 'app-1', name: 'My App' };
      vi.mocked(Core.appDetail).mockResolvedValue(sample as any);
      const message = { payload: { identifier: 'app-1' }, correlationId: 'corr-3' };

      await transport.handlers.get('appDetail')!(message, client);

      expect(Core.appDetail).toHaveBeenCalledWith('app-1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppDetail',
        IPCMessage.success(sample, 'corr-3')
      );
    });

    it('emits a failure message when Core.appDetail rejects', async () => {
      vi.mocked(Core.appDetail).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'app-1' }, correlationId: 'corr-3' };

      await transport.handlers.get('appDetail')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppDetail',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appDetail')!(
        { payload: { identifier: 'app-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.appDetail).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appUpdateSource', () => {
    it('resolves with the updated app on success', async () => {
      const sample = { identifier: 'app-1', source: '{}' };
      vi.mocked(Core.appUpdateSource).mockResolvedValue(sample as any);
      const message = {
        payload: { identifier: 'app-1', source: '{"a":1}' },
        correlationId: 'corr-4',
      };

      await transport.handlers.get('appUpdateSource')!(message, client);

      expect(Core.appUpdateSource).toHaveBeenCalledWith('app-1', '{"a":1}');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppUpdateSource',
        IPCMessage.success(sample, 'corr-4')
      );
    });

    it('emits a failure message when Core.appUpdateSource rejects', async () => {
      vi.mocked(Core.appUpdateSource).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { identifier: 'app-1', source: '{}' },
        correlationId: 'corr-4',
      };

      await transport.handlers.get('appUpdateSource')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppUpdateSource',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appUpdateSource')!(
        { payload: { identifier: 'app-1', source: '{}' }, correlationId: 'x' },
        undefined
      );

      expect(Core.appUpdateSource).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appExport', () => {
    it('passes the target path and identifiers to Core.appExport', async () => {
      vi.mocked(Core.appExport).mockResolvedValue({ count: 1, workflowCount: 2 });
      const message = { payload: { targetPath: '/tmp/a.zip', identifiers: ['app-1'] }, correlationId: 'corr-x' };

      await transport.handlers.get('appExport')!(message, client);

      expect(Core.appExport).toHaveBeenCalledWith('/tmp/a.zip', ['app-1']);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppExport',
        IPCMessage.success({ count: 1, workflowCount: 2 }, 'corr-x')
      );
    });

    it('emits a failure message when Core.appExport rejects', async () => {
      vi.mocked(Core.appExport).mockRejectedValue(new Error('boom'));
      const message = { payload: { targetPath: '/tmp/a.zip' }, correlationId: 'corr-x' };

      await transport.handlers.get('appExport')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(client, 'onAppExport', IPCMessage.failure('boom', 'corr-x'));
    });
  });

  describe('appUninstall', () => {
    it('resolves on success', async () => {
      vi.mocked(Core.appUninstall).mockResolvedValue('uninstalled' as any);
      const message = { payload: { identifier: 'app-1' }, correlationId: 'corr-5' };

      await transport.handlers.get('appUninstall')!(message, client);

      expect(Core.appUninstall).toHaveBeenCalledWith('app-1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppUninstall',
        IPCMessage.success('uninstalled', 'corr-5')
      );
    });

    it('emits a failure message when Core.appUninstall rejects', async () => {
      vi.mocked(Core.appUninstall).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'app-1' }, correlationId: 'corr-5' };

      await transport.handlers.get('appUninstall')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppUninstall',
        IPCMessage.failure('boom', 'corr-5')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appUninstall')!(
        { payload: { identifier: 'app-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.appUninstall).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appInstall', () => {
    it('passes the full payload through to Core.appInstall on success', async () => {
      const sample = { identifier: 'app-1' };
      vi.mocked(Core.appInstall).mockResolvedValue(sample as any);
      const message = { payload: '/some/path.zip', correlationId: 'corr-6' };

      await transport.handlers.get('appInstall')!(message, client);

      expect(Core.appInstall).toHaveBeenCalledWith('/some/path.zip');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppInstall',
        IPCMessage.success(sample, 'corr-6')
      );
    });

    it('emits a failure message when Core.appInstall rejects', async () => {
      vi.mocked(Core.appInstall).mockRejectedValue(new Error('boom'));
      const message = { payload: '/some/path.zip', correlationId: 'corr-6' };

      await transport.handlers.get('appInstall')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onAppInstall',
        IPCMessage.failure('boom', 'corr-6')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appInstall')!(
        { payload: '/some/path.zip', correlationId: 'x' },
        undefined
      );

      expect(Core.appInstall).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('tableDataFetch', () => {
    it('passes the full payload through to Core.tableDataFetch on success', async () => {
      const sample = { rows: [], total: 0 };
      vi.mocked(Core.tableDataFetch).mockResolvedValue(sample as any);
      const payload = { table: 'tasks', page: 1 };
      const message = { payload, correlationId: 'corr-7' };

      await transport.handlers.get('tableDataFetch')!(message, client);

      expect(Core.tableDataFetch).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTableDataFetch',
        IPCMessage.success(sample, 'corr-7')
      );
    });

    it('emits a failure message when Core.tableDataFetch rejects', async () => {
      vi.mocked(Core.tableDataFetch).mockRejectedValue(new Error('boom'));
      const message = { payload: { table: 'tasks' }, correlationId: 'corr-7' };

      await transport.handlers.get('tableDataFetch')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTableDataFetch',
        IPCMessage.failure('boom', 'corr-7')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('tableDataFetch')!(
        { payload: { table: 'tasks' }, correlationId: 'x' },
        undefined
      );

      expect(Core.tableDataFetch).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('appHistoryFetch', () => {
    it('passes the payload through to Core.appHistoryFetch and emits the rows', async () => {
      const rows = [{ id: 1 }];
      vi.mocked(Core.appHistoryFetch).mockResolvedValue(rows as any);
      const payload = { appIdentifier: 'app-1', pageId: 'home', runnable: 'invoices' };

      await transport.handlers.get('appHistoryFetch')!({ payload, correlationId: 'corr-8' }, client);

      expect(Core.appHistoryFetch).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(client, 'onAppHistoryFetch', IPCMessage.success(rows, 'corr-8'));
    });

    it('emits a failure message when Core.appHistoryFetch rejects', async () => {
      vi.mocked(Core.appHistoryFetch).mockRejectedValue(new Error('nope'));

      await transport.handlers.get('appHistoryFetch')!({ payload: {}, correlationId: 'corr-8' }, client);

      expect(transport.emit).toHaveBeenCalledWith(client, 'onAppHistoryFetch', IPCMessage.failure('nope', 'corr-8'));
    });
  });

  describe('appRun', () => {
    const payload = { appIdentifier: 'app-1', pageId: 'home', runnable: 'approve', inputs: { id: 7 } };

    it('closes the stream with the top-level run outputs, ignoring sub-workflow taskEnd events', async () => {
      vi.mocked(Core.appRun).mockImplementation(async (_params, correlationId) => {
        // A sub-workflow finishing first: no `outputs` key.
        coreEvents.emit(`taskEnd:${correlationId}`, { pipelineIdentifier: 'child-pipe', taskIdentifier: 'child' });
        coreEvents.emit(`taskEnd:${correlationId}`, {
          pipelineIdentifier: 'pipe-1',
          taskIdentifier: 'task-1',
          outputs: { total: 3 },
        });
        return { taskIdentifier: 'task-1' };
      });

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      expect(Core.appRun).toHaveBeenCalledWith(payload, 'corr-9');
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success(
          { taskIdentifier: 'task-1', pipelineIdentifier: 'pipe-1', outputs: { total: 3 }, status: 'completed' },
          'corr-9'
        )
      );
      expect(coreEvents.listenerCount('taskEnd:corr-9')).toBe(0);
    });

    it('says when the run stopped at an approval step instead of finishing', async () => {
      vi.mocked(Core.appRun).mockImplementation(async (_params, correlationId) => {
        coreEvents.emit(`taskEnd:${correlationId}`, { pipelineIdentifier: 'pipe-1', outputs: {}, status: 'paused' });
        return { taskIdentifier: 'task-1' };
      });

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success({ taskIdentifier: 'task-1', pipelineIdentifier: 'pipe-1', outputs: {}, status: 'paused' }, 'corr-9')
      );
    });

    it('says when the run was canceled', async () => {
      vi.mocked(Core.appRun).mockImplementation(async (_params, correlationId) => {
        coreEvents.emit(`taskEnd:${correlationId}`, { pipelineIdentifier: '', outputs: {}, status: 'canceled' });
        return { taskIdentifier: 'task-1' };
      });

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success({ taskIdentifier: 'task-1', pipelineIdentifier: '', outputs: {}, status: 'canceled' }, 'corr-9')
      );
    });

    it('broadcasts onTaskError (with ActionError data when available) and unbinds', async () => {
      const actionError = new ActionError('browser', 'click', 'element not found', []);
      vi.mocked(Core.appRun).mockRejectedValue(actionError);

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      expect(broadcast).toHaveBeenCalledWith('onTaskError', IPCMessage.failure(actionError.toData(), 'corr-9'));
      expect(broadcast).not.toHaveBeenCalledWith('onTaskEndAll', expect.anything());
      expect(coreEvents.listenerCount('taskEnd:corr-9')).toBe(0);
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('appRun')!({ payload, correlationId: 'x' }, undefined);
      expect(Core.appRun).not.toHaveBeenCalled();
    });

    it('names the app on the first onTaskStart only (children start later)', async () => {
      vi.mocked(Core.appRun).mockImplementation(async (_params, correlationId) => {
        coreEvents.emit(`taskStart:${correlationId}`, { pipelineIdentifier: 'pipe-1', taskIdentifier: 'task-1' });
        coreEvents.emit(`taskStart:${correlationId}`, { pipelineIdentifier: 'child-pipe', taskIdentifier: 'child' });
        return { taskIdentifier: 'task-1' };
      });

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      const starts = broadcast.mock.calls.filter(([event]) => event === 'onTaskStart').map(([, msg]) => msg);
      expect(starts).toEqual([
        IPCMessage.success(
          {
            pipelineIdentifier: 'pipe-1',
            taskIdentifier: 'task-1',
            app: { appIdentifier: 'app-1', pageId: 'home', runnable: 'approve' },
          },
          'corr-9'
        ),
        IPCMessage.success({ pipelineIdentifier: 'child-pipe', taskIdentifier: 'child' }, 'corr-9'),
      ]);
    });

    it('lists the run in appRunsActive while it runs (with its progress), and not after', async () => {
      const list = () =>
        new Promise<any[]>((resolve) => {
          transport.emit.mockImplementationOnce((_c: any, _e: string, msg: any) => resolve(msg.data));
          transport.handlers.get('appRunsActive')!({ payload: { appIdentifier: 'app-1' }, correlationId: 'q' }, client);
        });
      let during: any[] = [];
      vi.mocked(Core.appRun).mockImplementation(async (_params, correlationId) => {
        coreEvents.emit(`taskStart:${correlationId}`, { pipelineIdentifier: 'pipe-1' });
        coreEvents.emit(`action:${correlationId}`, { name: 'file.read' });
        coreEvents.emit(`action:${correlationId}`, { name: 'http.get' });
        during = await list();
        return { taskIdentifier: 'task-1' };
      });

      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      expect(during).toEqual([
        expect.objectContaining({
          correlationId: 'corr-9',
          appIdentifier: 'app-1',
          pageId: 'home',
          runnable: 'approve',
          pipelineIdentifier: 'pipe-1',
          steps: 2,
          lastStep: 'http.get',
          startedAt: expect.any(Number),
        }),
      ]);
      expect(await list()).toEqual([]);
    });

    it('stops listing a run that failed', async () => {
      vi.mocked(Core.appRun).mockRejectedValue(new Error('boom'));
      await transport.handlers.get('appRun')!({ payload, correlationId: 'corr-9' }, client);

      transport.handlers.get('appRunsActive')!({ payload: { appIdentifier: 'app-1' }, correlationId: 'q' }, client);
      await vi.waitFor(() => expect(transport.emit).toHaveBeenCalled());
      expect(transport.emit).toHaveBeenCalledWith(client, 'onAppRunsActive', IPCMessage.success([], 'q'));
    });
  });
});

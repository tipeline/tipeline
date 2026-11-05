import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    taskList: vi.fn(),
    taskUpdateSource: vi.fn(),
    taskNew: vi.fn(),
    taskDetail: vi.fn(),
    taskValidate: vi.fn(),
    scriptPreview: vi.fn(),
    taskInstall: vi.fn(),
    taskInstallFromContent: vi.fn(),
    taskReload: vi.fn(),
    taskUpdateMeta: vi.fn(),
    taskUninstall: vi.fn(),
    exec: vi.fn(),
    run: vi.fn(),
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

vi.mock('@engine/DebugController', () => ({
  DebugController: {
    cleanup: vi.fn(),
  },
}));

import { registerTaskHandlers } from '@engine/handlers/taskHandlers';
import Core from '@engine/Core';
import IPCMessage from '@engine/IPCMessage';
import { coreEvents } from '@engine/CoreEvents';
import { DebugController } from '@engine/DebugController';
import { ActionError } from '@utils/ActionError';

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

describe('taskHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  let broadcast: ReturnType<typeof vi.fn>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.taskList).mockReset();
    vi.mocked(Core.taskUpdateSource).mockReset();
    vi.mocked(Core.taskNew).mockReset();
    vi.mocked(Core.taskDetail).mockReset();
    vi.mocked(Core.taskValidate).mockReset();
    vi.mocked(Core.taskInstall).mockReset();
    vi.mocked(Core.taskInstallFromContent).mockReset();
    vi.mocked(Core.taskReload).mockReset();
    vi.mocked(Core.taskUpdateMeta).mockReset();
    vi.mocked(Core.taskUninstall).mockReset();
    vi.mocked(Core.exec).mockReset();
    vi.mocked(Core.run).mockReset();
    bindMock.mockReset();
    unbindMock.mockReset();
    TaskStreamListenerCtor.mockReset();
    vi.mocked(DebugController.cleanup).mockReset();
    transport = createFakeTransport();
    broadcast = vi.fn();
    registerTaskHandlers(transport as any, broadcast);
  });

  describe('taskList', () => {
    it('resolves with the task list on success', async () => {
      const sample = [{ identifier: 't1' }];
      vi.mocked(Core.taskList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('taskList')!(message, client);

      expect(Core.taskList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.taskList rejects', async () => {
      vi.mocked(Core.taskList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('taskList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.taskList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskUpdateSource', () => {
    it('passes identifier and source through to Core.taskUpdateSource', async () => {
      const sample = { identifier: 't1', source: '{}' };
      vi.mocked(Core.taskUpdateSource).mockResolvedValue(sample as any);
      const message = {
        payload: { identifier: 't1', source: '{"a":1}' },
        correlationId: 'corr-2',
      };

      await transport.handlers.get('taskUpdateSource')!(message, client);

      expect(Core.taskUpdateSource).toHaveBeenCalledWith('t1', '{"a":1}');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUpdateSource',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.taskUpdateSource rejects', async () => {
      vi.mocked(Core.taskUpdateSource).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1', source: '{}' }, correlationId: 'corr-2' };

      await transport.handlers.get('taskUpdateSource')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUpdateSource',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskUpdateSource')!(
        { payload: { identifier: 't1', source: '{}' }, correlationId: 'x' },
        undefined
      );

      expect(Core.taskUpdateSource).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskNew', () => {
    it('passes payload.data through to Core.taskNew', async () => {
      const sample = { identifier: 't1' };
      vi.mocked(Core.taskNew).mockResolvedValue(sample as any);
      const data = { name: 'New Task' };
      const message = { payload: { data }, correlationId: 'corr-3' };

      await transport.handlers.get('taskNew')!(message, client);

      expect(Core.taskNew).toHaveBeenCalledWith(data);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskNew',
        IPCMessage.success(sample, 'corr-3')
      );
    });

    it('emits a failure message when Core.taskNew rejects', async () => {
      vi.mocked(Core.taskNew).mockRejectedValue(new Error('boom'));
      const message = { payload: { data: {} }, correlationId: 'corr-3' };

      await transport.handlers.get('taskNew')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskNew',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskNew')!({ payload: { data: {} }, correlationId: 'x' }, undefined);

      expect(Core.taskNew).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskDetail', () => {
    it('passes payload.identifier through to Core.taskDetail', async () => {
      const sample = { identifier: 't1' };
      vi.mocked(Core.taskDetail).mockResolvedValue(sample as any);
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-4' };

      await transport.handlers.get('taskDetail')!(message, client);

      expect(Core.taskDetail).toHaveBeenCalledWith('t1', false);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskDetail',
        IPCMessage.success(sample, 'corr-4')
      );
    });

    it('asks for capabilities when the payload says so (the CLI\'s workflow info)', async () => {
      vi.mocked(Core.taskDetail).mockResolvedValue({ identifier: 't1' } as any);
      const message = { payload: { identifier: 't1', capabilities: true }, correlationId: 'corr-5' };

      await transport.handlers.get('taskDetail')!(message, client);

      expect(Core.taskDetail).toHaveBeenCalledWith('t1', true);
    });

    it('emits a failure message when Core.taskDetail rejects', async () => {
      vi.mocked(Core.taskDetail).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-4' };

      await transport.handlers.get('taskDetail')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskDetail',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskDetail')!(
        { payload: { identifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.taskDetail).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('scriptPreview', () => {
    it('passes the payload to Core.scriptPreview and replies with its result', async () => {
      const result = { ok: true, hasResult: true, result: 2, logs: [], context: {}, durationMs: 1 };
      vi.mocked(Core.scriptPreview).mockResolvedValue(result as any);
      const payload = { code: 'return 2;', context: {}, variables: {} };

      await transport.handlers.get('scriptPreview')!({ payload, correlationId: 'corr-sp' }, client);

      expect(Core.scriptPreview).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScriptPreview',
        IPCMessage.success(result, 'corr-sp')
      );
    });

    it('emits a failure message when Core.scriptPreview rejects', async () => {
      vi.mocked(Core.scriptPreview).mockRejectedValue(new Error('Script preview needs code.'));

      await transport.handlers.get('scriptPreview')!({ payload: {}, correlationId: 'corr-sp' }, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onScriptPreview',
        IPCMessage.failure('Script preview needs code.', 'corr-sp')
      );
    });
  });

  describe('taskValidate', () => {
    it('passes payload.source through to Core.taskValidate', async () => {
      vi.mocked(Core.taskValidate).mockResolvedValue('valid' as any);
      const message = { payload: { source: 'name: x' }, correlationId: 'corr-5' };

      await transport.handlers.get('taskValidate')!(message, client);

      expect(Core.taskValidate).toHaveBeenCalledWith('name: x');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskValidate',
        IPCMessage.success('valid', 'corr-5')
      );
    });

    it('emits a failure message when Core.taskValidate rejects', async () => {
      vi.mocked(Core.taskValidate).mockRejectedValue(new Error('boom'));
      const message = { payload: { source: 'name: x' }, correlationId: 'corr-5' };

      await transport.handlers.get('taskValidate')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskValidate',
        IPCMessage.failure('boom', 'corr-5')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskValidate')!(
        { payload: '/some/task.yaml', correlationId: 'x' },
        undefined
      );

      expect(Core.taskValidate).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskInstall', () => {
    it('uses message.payload as the file path when message is an object', async () => {
      vi.mocked(Core.taskInstall).mockResolvedValue({ identifier: 't1' } as any);
      const message = { payload: '/some/task.json', correlationId: 'corr-6' };

      await transport.handlers.get('taskInstall')!(message, client);

      expect(Core.taskInstall).toHaveBeenCalledWith('/some/task.json');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskInstall',
        IPCMessage.success('Workflow installed successfully: t1', 'corr-6')
      );
    });

    it('uses Core.taskInstallFromContent when payload is an object with a content key', async () => {
      vi.mocked(Core.taskInstallFromContent).mockResolvedValue({ identifier: 't3' } as any);
      const payload = { content: '{"name":"t3"}', baseDir: '/some/dir' };
      const message = { payload, correlationId: 'corr-7' };

      await transport.handlers.get('taskInstall')!(message, client);

      expect(Core.taskInstallFromContent).toHaveBeenCalledWith(payload.content, payload.baseDir);
      expect(Core.taskInstall).not.toHaveBeenCalled();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskInstall',
        IPCMessage.success('Workflow installed successfully: t3', 'corr-7')
      );
    });

    it('emits a failure message when Core.taskInstallFromContent rejects', async () => {
      vi.mocked(Core.taskInstallFromContent).mockRejectedValue(new Error('bad content'));
      const message = { payload: { content: 'garbage' }, correlationId: 'corr-7' };

      await transport.handlers.get('taskInstall')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskInstall',
        IPCMessage.failure('bad content', 'corr-7')
      );
    });

    it('uses the message itself as the file path when message is a string', async () => {
      vi.mocked(Core.taskInstall).mockResolvedValue({ identifier: 't2' } as any);

      await transport.handlers.get('taskInstall')!('/raw/string/path.json' as any, client);

      expect(Core.taskInstall).toHaveBeenCalledWith('/raw/string/path.json');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskInstall',
        IPCMessage.success('Workflow installed successfully: t2', undefined)
      );
    });

    it('emits a failure message when Core.taskInstall rejects', async () => {
      vi.mocked(Core.taskInstall).mockRejectedValue(new Error('boom'));
      const message = { payload: '/some/task.json', correlationId: 'corr-6' };

      await transport.handlers.get('taskInstall')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskInstall',
        IPCMessage.failure('boom', 'corr-6')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskInstall')!(
        { payload: '/some/task.json', correlationId: 'x' },
        undefined
      );

      expect(Core.taskInstall).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskReload', () => {
    it('passes identifier and path through to Core.taskReload', async () => {
      vi.mocked(Core.taskReload).mockResolvedValue({ identifier: 't1' } as any);
      const message = {
        payload: { identifier: 't1', path: '/some/task.json' },
        correlationId: 'corr-7',
      };

      await transport.handlers.get('taskReload')!(message, client);

      expect(Core.taskReload).toHaveBeenCalledWith('t1', '/some/task.json');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskReload',
        IPCMessage.success('Workflow reloaded successfully: t1', 'corr-7')
      );
    });

    it('formats the message with "undefined" when Core.taskReload resolves nothing', async () => {
      vi.mocked(Core.taskReload).mockResolvedValue(undefined as any);
      const message = {
        payload: { identifier: 't1', path: '/some/task.json' },
        correlationId: 'corr-7',
      };

      await transport.handlers.get('taskReload')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskReload',
        IPCMessage.success('Workflow reloaded successfully: undefined', 'corr-7')
      );
    });

    it('emits a failure message when Core.taskReload rejects', async () => {
      vi.mocked(Core.taskReload).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { identifier: 't1', path: '/some/task.json' },
        correlationId: 'corr-7',
      };

      await transport.handlers.get('taskReload')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskReload',
        IPCMessage.failure('boom', 'corr-7')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskReload')!(
        { payload: { identifier: 't1', path: '/x' }, correlationId: 'x' },
        undefined
      );

      expect(Core.taskReload).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskUpdateMeta', () => {
    it('destructures identifier out of payload and passes the rest as data', async () => {
      const sample = { identifier: 't1', name: 'Renamed' };
      vi.mocked(Core.taskUpdateMeta).mockResolvedValue(sample as any);
      const message = {
        payload: { identifier: 't1', name: 'Renamed', version: '2.0' },
        correlationId: 'corr-8',
      };

      await transport.handlers.get('taskUpdateMeta')!(message, client);

      expect(Core.taskUpdateMeta).toHaveBeenCalledWith('t1', { name: 'Renamed', version: '2.0' });
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUpdateMeta',
        IPCMessage.success(sample, 'corr-8')
      );
    });

    it('emits a failure message when Core.taskUpdateMeta rejects', async () => {
      vi.mocked(Core.taskUpdateMeta).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1', name: 'X' }, correlationId: 'corr-8' };

      await transport.handlers.get('taskUpdateMeta')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUpdateMeta',
        IPCMessage.failure('boom', 'corr-8')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskUpdateMeta')!(
        { payload: { identifier: 't1', name: 'X' }, correlationId: 'x' },
        undefined
      );

      expect(Core.taskUpdateMeta).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('taskUninstall', () => {
    it('calls Core.taskUninstall and emits the trash item with a message', async () => {
      vi.mocked(Core.taskUninstall).mockResolvedValue({ identifier: 't1', trashId: 4 });
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-9' };

      await transport.handlers.get('taskUninstall')!(message, client);

      expect(Core.taskUninstall).toHaveBeenCalledWith('t1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUninstall',
        IPCMessage.success({ identifier: 't1', trashId: 4, message: 'Workflow moved to the Trash' }, 'corr-9')
      );
    });

    it('emits a failure message when Core.taskUninstall rejects', async () => {
      vi.mocked(Core.taskUninstall).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-9' };

      await transport.handlers.get('taskUninstall')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onTaskUninstall',
        IPCMessage.failure('boom', 'corr-9')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('taskUninstall')!(
        { payload: { identifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.taskUninstall).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('exec', () => {
    it('binds a TaskStreamListener, execs the task, and broadcasts onTaskEndAll on success', async () => {
      vi.mocked(Core.exec).mockResolvedValue(undefined as any);
      const message = {
        payload: { identifier: 't1', variables: { a: 1 }, stepMode: true, debugMode: true },
        correlationId: 'corr-10',
      };

      await transport.handlers.get('exec')!(message, client);

      expect(TaskStreamListenerCtor).toHaveBeenCalledWith('corr-10', broadcast);
      expect(bindMock).toHaveBeenCalledTimes(1);
      // A run started from Desktop or the CLI may run a draft (to test it); see task/Draft.ts.
      expect(Core.exec).toHaveBeenCalledWith('t1', 'corr-10', { a: 1 }, true, true, { cacheMode: 'use', allowDraft: true });
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success('Workflow finished successfully', 'corr-10')
      );
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(DebugController.cleanup).toHaveBeenCalledWith('corr-10');
      expect(transport.emit).not.toHaveBeenCalled();
    });

    it('defaults variables/stepMode/debugMode when absent from payload', async () => {
      vi.mocked(Core.exec).mockResolvedValue(undefined as any);
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-10' };

      await transport.handlers.get('exec')!(message, client);

      expect(Core.exec).toHaveBeenCalledWith('t1', 'corr-10', {}, false, false, { cacheMode: 'use', allowDraft: true });
    });

    it('broadcasts onTaskError with the plain message when a normal Error is thrown, and still cleans up', async () => {
      vi.mocked(Core.exec).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-10' };

      await transport.handlers.get('exec')!(message, client);

      expect(broadcast).toHaveBeenCalledWith('onTaskError', IPCMessage.failure('boom', 'corr-10'));
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(DebugController.cleanup).toHaveBeenCalledWith('corr-10');
    });

    it('broadcasts onTaskError with ActionError.toData() when an ActionError is thrown', async () => {
      const actionError = new ActionError('browser', 'click', 'element not found', [
        { path: 'selector', message: 'required' } as any,
      ]);
      vi.mocked(Core.exec).mockRejectedValue(actionError);
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-10' };

      await transport.handlers.get('exec')!(message, client);

      expect(broadcast).toHaveBeenCalledWith(
        'onTaskError',
        IPCMessage.failure(actionError.toData(), 'corr-10')
      );
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(DebugController.cleanup).toHaveBeenCalledWith('corr-10');
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('exec')!(
        { payload: { identifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.exec).not.toHaveBeenCalled();
      expect(TaskStreamListenerCtor).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
      expect(DebugController.cleanup).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    it('binds a TaskStreamListener, runs the payload, and broadcasts onTaskEndAll on success (no DebugController.cleanup)', async () => {
      vi.mocked(Core.run).mockResolvedValue(undefined as any);
      const payload = { identifier: 't1' };
      const message = { payload, correlationId: 'corr-11' };

      await transport.handlers.get('run')!(message, client);

      expect(TaskStreamListenerCtor).toHaveBeenCalledWith('corr-11', broadcast);
      expect(bindMock).toHaveBeenCalledTimes(1);
      expect(Core.run).toHaveBeenCalledWith(payload, 'corr-11');
      expect(broadcast).toHaveBeenCalledWith(
        'onTaskEndAll',
        IPCMessage.success('Workflow finished successfully', 'corr-11')
      );
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(DebugController.cleanup).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });

    it('broadcasts onTaskError with the plain message when a normal Error is thrown', async () => {
      vi.mocked(Core.run).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-11' };

      await transport.handlers.get('run')!(message, client);

      expect(broadcast).toHaveBeenCalledWith('onTaskError', IPCMessage.failure('boom', 'corr-11'));
      expect(unbindMock).toHaveBeenCalledTimes(1);
      expect(DebugController.cleanup).not.toHaveBeenCalled();
    });

    it('broadcasts onTaskError with ActionError.toData() when an ActionError is thrown', async () => {
      const actionError = new ActionError('file', 'read', 'file not found');
      vi.mocked(Core.run).mockRejectedValue(actionError);
      const message = { payload: { identifier: 't1' }, correlationId: 'corr-11' };

      await transport.handlers.get('run')!(message, client);

      expect(broadcast).toHaveBeenCalledWith(
        'onTaskError',
        IPCMessage.failure(actionError.toData(), 'corr-11')
      );
      expect(unbindMock).toHaveBeenCalledTimes(1);
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('run')!(
        { payload: { identifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.run).not.toHaveBeenCalled();
      expect(TaskStreamListenerCtor).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });
  });

  describe('debug control events', () => {
    it('emits debug:next:<correlationId> on debugNext', () => {
      const emitSpy = vi.spyOn(coreEvents, 'emit');
      transport.handlers.get('debugNext')!({ correlationId: 'corr-12' }, undefined);

      expect(emitSpy).toHaveBeenCalledWith('debug:next:corr-12');
      emitSpy.mockRestore();
    });

    it('emits debug:run:<correlationId> on debugRun', () => {
      const emitSpy = vi.spyOn(coreEvents, 'emit');
      transport.handlers.get('debugRun')!({ correlationId: 'corr-13' }, undefined);

      expect(emitSpy).toHaveBeenCalledWith('debug:run:corr-13');
      emitSpy.mockRestore();
    });

    it('emits debug:pause:<correlationId> on debugPause', () => {
      const emitSpy = vi.spyOn(coreEvents, 'emit');
      transport.handlers.get('debugPause')!({ correlationId: 'corr-14' }, undefined);

      expect(emitSpy).toHaveBeenCalledWith('debug:pause:corr-14');
      emitSpy.mockRestore();
    });

    it('emits debug:stop:<correlationId> on debugStop', () => {
      const emitSpy = vi.spyOn(coreEvents, 'emit');
      transport.handlers.get('debugStop')!({ correlationId: 'corr-15' }, undefined);

      expect(emitSpy).toHaveBeenCalledWith('debug:stop:corr-15');
      emitSpy.mockRestore();
    });
  });
});

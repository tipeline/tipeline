import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    projectList: vi.fn(),
    projectNew: vi.fn(),
    projectDetail: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectDeletePreview: vi.fn(),
    projectAssignTask: vi.fn(),
    projectUnassignTask: vi.fn(),
    projectAssignApp: vi.fn(),
    projectUnassignApp: vi.fn(),
  },
}));

import { registerProjectHandlers } from '@engine/handlers/projectHandlers';
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

describe('projectHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.projectList).mockReset();
    vi.mocked(Core.projectNew).mockReset();
    vi.mocked(Core.projectDetail).mockReset();
    vi.mocked(Core.projectUpdate).mockReset();
    vi.mocked(Core.projectDelete).mockReset();
    vi.mocked(Core.projectDeletePreview).mockReset();
    vi.mocked(Core.projectAssignTask).mockReset();
    vi.mocked(Core.projectUnassignTask).mockReset();
    vi.mocked(Core.projectAssignApp).mockReset();
    vi.mocked(Core.projectUnassignApp).mockReset();
    transport = createFakeTransport();
    registerProjectHandlers(transport as any);
  });

  describe('projectList', () => {
    it('resolves with the project list on success', async () => {
      const sample = [{ identifier: 'p1' }];
      vi.mocked(Core.projectList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('projectList')!(message, client);

      expect(Core.projectList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.projectList rejects', async () => {
      vi.mocked(Core.projectList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('projectList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.projectList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectNew', () => {
    it('passes the full payload through to Core.projectNew on success', async () => {
      const sample = { identifier: 'p1' };
      vi.mocked(Core.projectNew).mockResolvedValue(sample as any);
      const payload = { name: 'My Project' };
      const message = { payload, correlationId: 'corr-2' };

      await transport.handlers.get('projectNew')!(message, client);

      expect(Core.projectNew).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectNew',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.projectNew rejects', async () => {
      vi.mocked(Core.projectNew).mockRejectedValue(new Error('boom'));
      const message = { payload: { name: 'My Project' }, correlationId: 'corr-2' };

      await transport.handlers.get('projectNew')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectNew',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectNew')!(
        { payload: { name: 'My Project' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectNew).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectDetail', () => {
    it('resolves with the project detail on success', async () => {
      const sample = { identifier: 'p1' };
      vi.mocked(Core.projectDetail).mockResolvedValue(sample as any);
      const message = { payload: { identifier: 'p1' }, correlationId: 'corr-3' };

      await transport.handlers.get('projectDetail')!(message, client);

      expect(Core.projectDetail).toHaveBeenCalledWith('p1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectDetail',
        IPCMessage.success(sample, 'corr-3')
      );
    });

    it('emits a failure message when Core.projectDetail rejects', async () => {
      vi.mocked(Core.projectDetail).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'p1' }, correlationId: 'corr-3' };

      await transport.handlers.get('projectDetail')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectDetail',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectDetail')!(
        { payload: { identifier: 'p1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectDetail).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectUpdate', () => {
    it('splits identifier and data from payload on success', async () => {
      const sample = { identifier: 'p1', name: 'Renamed' };
      vi.mocked(Core.projectUpdate).mockResolvedValue(sample as any);
      const message = {
        payload: { identifier: 'p1', data: { name: 'Renamed' } },
        correlationId: 'corr-4',
      };

      await transport.handlers.get('projectUpdate')!(message, client);

      expect(Core.projectUpdate).toHaveBeenCalledWith('p1', { name: 'Renamed' });
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUpdate',
        IPCMessage.success(sample, 'corr-4')
      );
    });

    it('emits a failure message when Core.projectUpdate rejects', async () => {
      vi.mocked(Core.projectUpdate).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { identifier: 'p1', data: { name: 'Renamed' } },
        correlationId: 'corr-4',
      };

      await transport.handlers.get('projectUpdate')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUpdate',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectUpdate')!(
        { payload: { identifier: 'p1', data: {} }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectUpdate).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectDelete', () => {
    it('resolves on success', async () => {
      vi.mocked(Core.projectDelete).mockResolvedValue('deleted' as any);
      const message = { payload: { identifier: 'p1' }, correlationId: 'corr-5' };

      await transport.handlers.get('projectDelete')!(message, client);

      expect(Core.projectDelete).toHaveBeenCalledWith('p1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectDelete',
        IPCMessage.success('deleted', 'corr-5')
      );
    });

    it('emits a failure message when Core.projectDelete rejects', async () => {
      vi.mocked(Core.projectDelete).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'p1' }, correlationId: 'corr-5' };

      await transport.handlers.get('projectDelete')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectDelete',
        IPCMessage.failure('boom', 'corr-5')
      );
    });

    it('passes the workflows and apps to delete along with it', async () => {
      vi.mocked(Core.projectDelete).mockResolvedValue({ identifier: 'p1', workflows: ['w1'], apps: [] } as any);
      const message = { payload: { identifier: 'p1', workflows: ['w1'], apps: [] }, correlationId: 'corr-6' };

      await transport.handlers.get('projectDelete')!(message, client);

      expect(Core.projectDelete).toHaveBeenCalledWith('p1', { workflows: ['w1'], apps: [] });
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectDelete')!(
        { payload: { identifier: 'p1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectDelete).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectDeletePreview', () => {
    it('resolves with the preview on success', async () => {
      const sample = { identifier: 'p1', workflows: [], apps: [] };
      vi.mocked(Core.projectDeletePreview).mockResolvedValue(sample as any);

      await transport.handlers.get('projectDeletePreview')!({ payload: { identifier: 'p1' }, correlationId: 'c' }, client);

      expect(Core.projectDeletePreview).toHaveBeenCalledWith('p1');
      expect(transport.emit).toHaveBeenCalledWith(client, 'onProjectDeletePreview', IPCMessage.success(sample, 'c'));
    });

    it('emits a failure message when Core.projectDeletePreview rejects', async () => {
      vi.mocked(Core.projectDeletePreview).mockRejectedValue(new Error('boom'));

      await transport.handlers.get('projectDeletePreview')!({ payload: { identifier: 'p1' }, correlationId: 'c' }, client);

      expect(transport.emit).toHaveBeenCalledWith(client, 'onProjectDeletePreview', IPCMessage.failure('boom', 'c'));
    });
  });

  describe('projectAssignTask', () => {
    it('passes projectIdentifier and taskIdentifier on success', async () => {
      const sample = { assigned: true };
      vi.mocked(Core.projectAssignTask).mockResolvedValue(sample as any);
      const message = {
        payload: { projectIdentifier: 'p1', taskIdentifier: 't1' },
        correlationId: 'corr-6',
      };

      await transport.handlers.get('projectAssignTask')!(message, client);

      expect(Core.projectAssignTask).toHaveBeenCalledWith('p1', 't1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectAssignTask',
        IPCMessage.success(sample, 'corr-6')
      );
    });

    it('emits a failure message when Core.projectAssignTask rejects', async () => {
      vi.mocked(Core.projectAssignTask).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { projectIdentifier: 'p1', taskIdentifier: 't1' },
        correlationId: 'corr-6',
      };

      await transport.handlers.get('projectAssignTask')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectAssignTask',
        IPCMessage.failure('boom', 'corr-6')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectAssignTask')!(
        { payload: { projectIdentifier: 'p1', taskIdentifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectAssignTask).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectUnassignTask', () => {
    it('passes taskIdentifier only on success', async () => {
      const sample = { unassigned: true };
      vi.mocked(Core.projectUnassignTask).mockResolvedValue(sample as any);
      const message = { payload: { taskIdentifier: 't1' }, correlationId: 'corr-7' };

      await transport.handlers.get('projectUnassignTask')!(message, client);

      expect(Core.projectUnassignTask).toHaveBeenCalledWith('t1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUnassignTask',
        IPCMessage.success(sample, 'corr-7')
      );
    });

    it('emits a failure message when Core.projectUnassignTask rejects', async () => {
      vi.mocked(Core.projectUnassignTask).mockRejectedValue(new Error('boom'));
      const message = { payload: { taskIdentifier: 't1' }, correlationId: 'corr-7' };

      await transport.handlers.get('projectUnassignTask')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUnassignTask',
        IPCMessage.failure('boom', 'corr-7')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectUnassignTask')!(
        { payload: { taskIdentifier: 't1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectUnassignTask).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectAssignApp', () => {
    it('passes projectIdentifier and appIdentifier on success', async () => {
      const sample = { assigned: true };
      vi.mocked(Core.projectAssignApp).mockResolvedValue(sample as any);
      const message = {
        payload: { projectIdentifier: 'p1', appIdentifier: 'a1' },
        correlationId: 'corr-8',
      };

      await transport.handlers.get('projectAssignApp')!(message, client);

      expect(Core.projectAssignApp).toHaveBeenCalledWith('p1', 'a1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectAssignApp',
        IPCMessage.success(sample, 'corr-8')
      );
    });

    it('emits a failure message when Core.projectAssignApp rejects', async () => {
      vi.mocked(Core.projectAssignApp).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { projectIdentifier: 'p1', appIdentifier: 'a1' },
        correlationId: 'corr-8',
      };

      await transport.handlers.get('projectAssignApp')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectAssignApp',
        IPCMessage.failure('boom', 'corr-8')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectAssignApp')!(
        { payload: { projectIdentifier: 'p1', appIdentifier: 'a1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectAssignApp).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('projectUnassignApp', () => {
    it('passes appIdentifier only on success', async () => {
      const sample = { unassigned: true };
      vi.mocked(Core.projectUnassignApp).mockResolvedValue(sample as any);
      const message = { payload: { appIdentifier: 'a1' }, correlationId: 'corr-9' };

      await transport.handlers.get('projectUnassignApp')!(message, client);

      expect(Core.projectUnassignApp).toHaveBeenCalledWith('a1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUnassignApp',
        IPCMessage.success(sample, 'corr-9')
      );
    });

    it('emits a failure message when Core.projectUnassignApp rejects', async () => {
      vi.mocked(Core.projectUnassignApp).mockRejectedValue(new Error('boom'));
      const message = { payload: { appIdentifier: 'a1' }, correlationId: 'corr-9' };

      await transport.handlers.get('projectUnassignApp')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onProjectUnassignApp',
        IPCMessage.failure('boom', 'corr-9')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('projectUnassignApp')!(
        { payload: { appIdentifier: 'a1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.projectUnassignApp).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});

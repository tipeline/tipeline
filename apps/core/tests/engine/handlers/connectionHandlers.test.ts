import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@database/services/ConnectionService', () => ({
  ConnectionService: {
    list: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    getActiveId: vi.fn(),
    getActive: vi.fn(),
    setActive: vi.fn(),
  },
}));

import { registerConnectionHandlers } from '@engine/handlers/connectionHandlers';
import { ConnectionService } from '@database/services/ConnectionService';
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

describe('connectionHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(ConnectionService.list).mockReset();
    vi.mocked(ConnectionService.add).mockReset();
    vi.mocked(ConnectionService.remove).mockReset();
    vi.mocked(ConnectionService.getActiveId).mockReset();
    vi.mocked(ConnectionService.getActive).mockReset();
    vi.mocked(ConnectionService.setActive).mockReset();
    transport = createFakeTransport();
    registerConnectionHandlers(transport as any);
  });

  describe('connectionList', () => {
    it('resolves with the connection list on success', async () => {
      const sample = [{ id: 'c1', name: 'Conn' }];
      vi.mocked(ConnectionService.list).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('connectionList')!(message, client);

      expect(ConnectionService.list).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when ConnectionService.list rejects', async () => {
      vi.mocked(ConnectionService.list).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('connectionList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('connectionList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(ConnectionService.list).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('connectionAdd', () => {
    it('destructures name/host/token from payload and calls ConnectionService.add', async () => {
      const sample = { id: 'c1', name: 'Conn', host: 'h', token: 't' };
      vi.mocked(ConnectionService.add).mockResolvedValue(sample as any);
      const message = {
        payload: { name: 'Conn', host: 'h', token: 't' },
        correlationId: 'corr-2',
      };

      await transport.handlers.get('connectionAdd')!(message, client);

      expect(ConnectionService.add).toHaveBeenCalledWith('Conn', 'h', 't');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionAdd',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when ConnectionService.add rejects', async () => {
      vi.mocked(ConnectionService.add).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { name: 'Conn', host: 'h', token: 't' },
        correlationId: 'corr-2',
      };

      await transport.handlers.get('connectionAdd')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionAdd',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('connectionAdd')!(
        { payload: { name: 'Conn', host: 'h', token: 't' }, correlationId: 'x' },
        undefined
      );

      expect(ConnectionService.add).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('connectionRemove', () => {
    it('calls ConnectionService.remove with the id and emits null data on success', async () => {
      vi.mocked(ConnectionService.remove).mockResolvedValue(undefined as any);
      const message = { payload: { id: 'c1' }, correlationId: 'corr-3' };

      await transport.handlers.get('connectionRemove')!(message, client);

      expect(ConnectionService.remove).toHaveBeenCalledWith('c1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionRemove',
        IPCMessage.success(null, 'corr-3')
      );
    });

    it('emits a failure message when ConnectionService.remove rejects', async () => {
      vi.mocked(ConnectionService.remove).mockRejectedValue(new Error('boom'));
      const message = { payload: { id: 'c1' }, correlationId: 'corr-3' };

      await transport.handlers.get('connectionRemove')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionRemove',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('connectionRemove')!(
        { payload: { id: 'c1' }, correlationId: 'x' },
        undefined
      );

      expect(ConnectionService.remove).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('connectionGetActive', () => {
    it('resolves activeId and connection in parallel and wraps them together', async () => {
      vi.mocked(ConnectionService.getActiveId).mockResolvedValue('c1');
      vi.mocked(ConnectionService.getActive).mockResolvedValue({ id: 'c1' } as any);
      const message = { payload: {}, correlationId: 'corr-4' };

      await transport.handlers.get('connectionGetActive')!(message, client);

      expect(ConnectionService.getActiveId).toHaveBeenCalledWith();
      expect(ConnectionService.getActive).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionGetActive',
        IPCMessage.success({ activeId: 'c1', connection: { id: 'c1' }, coreVersion: expect.any(String) }, 'corr-4')
      );
    });

    it('emits a failure message when either call rejects', async () => {
      vi.mocked(ConnectionService.getActiveId).mockResolvedValue('c1');
      vi.mocked(ConnectionService.getActive).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-4' };

      await transport.handlers.get('connectionGetActive')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionGetActive',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('connectionGetActive')!(
        { payload: {}, correlationId: 'x' },
        undefined
      );

      expect(ConnectionService.getActiveId).not.toHaveBeenCalled();
      expect(ConnectionService.getActive).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('connectionSetActive', () => {
    it('calls ConnectionService.setActive with the id and emits null data on success', async () => {
      vi.mocked(ConnectionService.setActive).mockResolvedValue(undefined as any);
      const message = { payload: { id: 'c1' }, correlationId: 'corr-5' };

      await transport.handlers.get('connectionSetActive')!(message, client);

      expect(ConnectionService.setActive).toHaveBeenCalledWith('c1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionSetActive',
        IPCMessage.success(null, 'corr-5')
      );
    });

    it('emits a failure message when ConnectionService.setActive rejects', async () => {
      vi.mocked(ConnectionService.setActive).mockRejectedValue(new Error('boom'));
      const message = { payload: { id: 'c1' }, correlationId: 'corr-5' };

      await transport.handlers.get('connectionSetActive')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onConnectionSetActive',
        IPCMessage.failure('boom', 'corr-5')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('connectionSetActive')!(
        { payload: { id: 'c1' }, correlationId: 'x' },
        undefined
      );

      expect(ConnectionService.setActive).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    status: vi.fn(),
    stop: vi.fn(),
  },
}));

import { registerSystemHandlers } from '@engine/handlers/systemHandlers';
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

describe('systemHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  let shutdown: ReturnType<typeof vi.fn>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.status).mockReset();
    vi.mocked(Core.stop).mockReset();
    transport = createFakeTransport();
    shutdown = vi.fn().mockResolvedValue(undefined);
    registerSystemHandlers(transport as any, shutdown);
  });

  describe('status', () => {
    it('resolves with the status on success', async () => {
      const sample = { status: 'running', pid: 1, uptime: 5 };
      vi.mocked(Core.status).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('status')!(message, client);

      expect(Core.status).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onStatus',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.status rejects', async () => {
      vi.mocked(Core.status).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('status')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onStatus',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('status')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.status).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('answers before shutting down, since shutting down ends the connection', async () => {
      const message = { payload: {}, correlationId: 'corr-2' };
      shutdown.mockImplementation(async () => {
        expect(transport.emit).toHaveBeenCalledWith(client, 'onStop', IPCMessage.success(null, 'corr-2'));
      });

      await transport.handlers.get('stop')!(message, client);

      expect(shutdown).toHaveBeenCalledTimes(1);
    });

    it('passes on whether to interrupt running jobs, which is off unless asked for', async () => {
      await transport.handlers.get('stop')!({ correlationId: 'corr-2' }, client);
      expect(shutdown).toHaveBeenLastCalledWith({ interrupt: false });

      await transport.handlers.get('stop')!({ payload: { interrupt: true }, correlationId: 'corr-2' }, client);
      expect(shutdown).toHaveBeenLastCalledWith({ interrupt: true });
    });

    it('reports a shutdown that fails', async () => {
      shutdown.mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-2' };

      await transport.handlers.get('stop')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onStop',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('stop')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.stop).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
      expect(shutdown).not.toHaveBeenCalled();
    });
  });
});

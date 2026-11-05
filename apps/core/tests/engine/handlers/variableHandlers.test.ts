import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    variableNew: vi.fn(),
    variableEdit: vi.fn(),
    variableList: vi.fn(),
    variableDelete: vi.fn(),
  },
}));

import { registerVariableHandlers } from '@engine/handlers/variableHandlers';
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

describe('variableHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.variableNew).mockReset();
    vi.mocked(Core.variableEdit).mockReset();
    vi.mocked(Core.variableList).mockReset();
    vi.mocked(Core.variableDelete).mockReset();
    transport = createFakeTransport();
    registerVariableHandlers(transport as any);
  });

  describe('variableNew', () => {
    it('passes the full payload through to Core.variableNew on success', async () => {
      const sample = { identifier: 'v1' };
      vi.mocked(Core.variableNew).mockResolvedValue(sample as any);
      const payload = { name: 'MY_VAR', value: '1' };
      const message = { payload, correlationId: 'corr-1' };

      await transport.handlers.get('variableNew')!(message, client);

      expect(Core.variableNew).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableNew',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.variableNew rejects', async () => {
      vi.mocked(Core.variableNew).mockRejectedValue(new Error('boom'));
      const message = { payload: { name: 'MY_VAR' }, correlationId: 'corr-1' };

      await transport.handlers.get('variableNew')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableNew',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('variableNew')!(
        { payload: { name: 'MY_VAR' }, correlationId: 'x' },
        undefined
      );

      expect(Core.variableNew).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('variableEdit', () => {
    it('passes the full payload through to Core.variableEdit on success', async () => {
      const sample = { identifier: 'v1', value: '2' };
      vi.mocked(Core.variableEdit).mockResolvedValue(sample as any);
      const payload = { identifier: 'v1', value: '2' };
      const message = { payload, correlationId: 'corr-2' };

      await transport.handlers.get('variableEdit')!(message, client);

      expect(Core.variableEdit).toHaveBeenCalledWith(payload);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableEdit',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.variableEdit rejects', async () => {
      vi.mocked(Core.variableEdit).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'v1' }, correlationId: 'corr-2' };

      await transport.handlers.get('variableEdit')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableEdit',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('variableEdit')!(
        { payload: { identifier: 'v1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.variableEdit).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('variableList', () => {
    it('resolves with the variable list on success', async () => {
      const sample = [{ identifier: 'v1' }];
      vi.mocked(Core.variableList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-3' };

      await transport.handlers.get('variableList')!(message, client);

      expect(Core.variableList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableList',
        IPCMessage.success(sample, 'corr-3')
      );
    });

    it('emits a failure message when Core.variableList rejects', async () => {
      vi.mocked(Core.variableList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-3' };

      await transport.handlers.get('variableList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableList',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('variableList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.variableList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('variableDelete', () => {
    it('calls Core.variableDelete with the identifier on success', async () => {
      vi.mocked(Core.variableDelete).mockResolvedValue('deleted' as any);
      const message = { payload: { identifier: 'v1' }, correlationId: 'corr-4' };

      await transport.handlers.get('variableDelete')!(message, client);

      expect(Core.variableDelete).toHaveBeenCalledWith('v1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableDelete',
        IPCMessage.success('deleted', 'corr-4')
      );
    });

    it('emits a failure message when Core.variableDelete rejects', async () => {
      vi.mocked(Core.variableDelete).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'v1' }, correlationId: 'corr-4' };

      await transport.handlers.get('variableDelete')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableDelete',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('emits a "payload is required" failure via the dedicated guard when payload is missing', async () => {
      const message = { payload: undefined, correlationId: 'corr-4' };

      await transport.handlers.get('variableDelete')!(message, client);

      expect(Core.variableDelete).not.toHaveBeenCalled();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onVariableDelete',
        IPCMessage.failure('payload is required', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('variableDelete')!(
        { payload: { identifier: 'v1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.variableDelete).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});

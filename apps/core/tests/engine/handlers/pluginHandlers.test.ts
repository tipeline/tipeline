import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    pluginList: vi.fn(),
    pluginDetail: vi.fn(),
    pluginSetEnabled: vi.fn(),
    pluginRemove: vi.fn(),
    pluginUsage: vi.fn(),
  },
}));

import { registerPluginHandlers } from '@engine/handlers/pluginHandlers';
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

describe('pluginHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.pluginList).mockReset();
    vi.mocked(Core.pluginDetail).mockReset();
    vi.mocked(Core.pluginSetEnabled).mockReset();
    vi.mocked(Core.pluginRemove).mockReset();
    vi.mocked(Core.pluginUsage).mockReset();
    transport = createFakeTransport();
    registerPluginHandlers(transport as any);
  });

  describe('pluginList', () => {
    it('resolves with the plugin list on success', async () => {
      const sample = [{ identifier: 'plugin-1' }];
      vi.mocked(Core.pluginList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('pluginList')!(message, client);

      expect(Core.pluginList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.pluginList rejects', async () => {
      vi.mocked(Core.pluginList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('pluginList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pluginList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.pluginList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pluginDetail', () => {
    it('resolves with the plugin detail on success', async () => {
      const sample = { identifier: 'plugin-1' };
      vi.mocked(Core.pluginDetail).mockResolvedValue(sample as any);
      const message = { payload: { identifier: 'plugin-1' }, correlationId: 'corr-2' };

      await transport.handlers.get('pluginDetail')!(message, client);

      expect(Core.pluginDetail).toHaveBeenCalledWith('plugin-1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginDetail',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.pluginDetail rejects', async () => {
      vi.mocked(Core.pluginDetail).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'plugin-1' }, correlationId: 'corr-2' };

      await transport.handlers.get('pluginDetail')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginDetail',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pluginDetail')!(
        { payload: { identifier: 'plugin-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pluginDetail).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pluginSetEnabled', () => {
    it('resolves with the updated plugin on success', async () => {
      const sample = { identifier: 'plugin-1', enabled: true };
      vi.mocked(Core.pluginSetEnabled).mockResolvedValue(sample as any);
      const message = {
        payload: { identifier: 'plugin-1', enabled: true },
        correlationId: 'corr-3',
      };

      await transport.handlers.get('pluginSetEnabled')!(message, client);

      expect(Core.pluginSetEnabled).toHaveBeenCalledWith('plugin-1', true);
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginSetEnabled',
        IPCMessage.success(sample, 'corr-3')
      );
    });

    it('emits a failure message when Core.pluginSetEnabled rejects', async () => {
      vi.mocked(Core.pluginSetEnabled).mockRejectedValue(new Error('boom'));
      const message = {
        payload: { identifier: 'plugin-1', enabled: false },
        correlationId: 'corr-3',
      };

      await transport.handlers.get('pluginSetEnabled')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginSetEnabled',
        IPCMessage.failure('boom', 'corr-3')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pluginSetEnabled')!(
        { payload: { identifier: 'plugin-1', enabled: true }, correlationId: 'x' },
        undefined
      );

      expect(Core.pluginSetEnabled).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pluginRemove', () => {
    it('resolves on success', async () => {
      vi.mocked(Core.pluginRemove).mockResolvedValue('removed' as any);
      const message = { payload: { identifier: 'plugin-1' }, correlationId: 'corr-4' };

      await transport.handlers.get('pluginRemove')!(message, client);

      expect(Core.pluginRemove).toHaveBeenCalledWith('plugin-1');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginRemove',
        IPCMessage.success('removed', 'corr-4')
      );
    });

    it('emits a failure message when Core.pluginRemove rejects', async () => {
      vi.mocked(Core.pluginRemove).mockRejectedValue(new Error('boom'));
      const message = { payload: { identifier: 'plugin-1' }, correlationId: 'corr-4' };

      await transport.handlers.get('pluginRemove')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginRemove',
        IPCMessage.failure('boom', 'corr-4')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pluginRemove')!(
        { payload: { identifier: 'plugin-1' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pluginRemove).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('pluginUsage', () => {
    it('resolves with the usage info on success', async () => {
      const sample = { count: 2, tasks: [{ name: 'T', identifier: 't1' }] };
      vi.mocked(Core.pluginUsage).mockResolvedValue(sample as any);
      const message = { payload: { group: 'browser' }, correlationId: 'corr-5' };

      await transport.handlers.get('pluginUsage')!(message, client);

      expect(Core.pluginUsage).toHaveBeenCalledWith('browser');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginUsage',
        IPCMessage.success(sample, 'corr-5')
      );
    });

    it('emits a failure message when Core.pluginUsage rejects', async () => {
      vi.mocked(Core.pluginUsage).mockRejectedValue(new Error('boom'));
      const message = { payload: { group: 'browser' }, correlationId: 'corr-5' };

      await transport.handlers.get('pluginUsage')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onPluginUsage',
        IPCMessage.failure('boom', 'corr-5')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('pluginUsage')!(
        { payload: { group: 'browser' }, correlationId: 'x' },
        undefined
      );

      expect(Core.pluginUsage).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});

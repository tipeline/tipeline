import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@engine/Core', () => ({
  default: {
    settingsList: vi.fn(),
    settingsSet: vi.fn(),
  },
}));

import { registerSettingsHandlers } from '@engine/handlers/settingsHandlers';
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

describe('settingsHandlers', () => {
  let transport: ReturnType<typeof createFakeTransport>;
  const client = { id: 'client-1' };

  beforeEach(() => {
    vi.mocked(Core.settingsList).mockReset();
    vi.mocked(Core.settingsSet).mockReset();
    transport = createFakeTransport();
    registerSettingsHandlers(transport as any);
  });

  describe('settingsList', () => {
    it('resolves with the settings list on success', async () => {
      const sample = [{ key: 'theme', value: 'dark' }];
      vi.mocked(Core.settingsList).mockResolvedValue(sample as any);
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('settingsList')!(message, client);

      expect(Core.settingsList).toHaveBeenCalledWith();
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onSettingsList',
        IPCMessage.success(sample, 'corr-1')
      );
    });

    it('emits a failure message when Core.settingsList rejects', async () => {
      vi.mocked(Core.settingsList).mockRejectedValue(new Error('boom'));
      const message = { payload: {}, correlationId: 'corr-1' };

      await transport.handlers.get('settingsList')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onSettingsList',
        IPCMessage.failure('boom', 'corr-1')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('settingsList')!({ payload: {}, correlationId: 'x' }, undefined);

      expect(Core.settingsList).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });

  describe('settingsSet', () => {
    it('calls Core.settingsSet with key and value on success', async () => {
      const sample = { key: 'theme', value: 'light' };
      vi.mocked(Core.settingsSet).mockResolvedValue(sample as any);
      const message = { payload: { key: 'theme', value: 'light' }, correlationId: 'corr-2' };

      await transport.handlers.get('settingsSet')!(message, client);

      expect(Core.settingsSet).toHaveBeenCalledWith('theme', 'light');
      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onSettingsSet',
        IPCMessage.success(sample, 'corr-2')
      );
    });

    it('emits a failure message when Core.settingsSet rejects', async () => {
      vi.mocked(Core.settingsSet).mockRejectedValue(new Error('boom'));
      const message = { payload: { key: 'theme', value: 'light' }, correlationId: 'corr-2' };

      await transport.handlers.get('settingsSet')!(message, client);

      expect(transport.emit).toHaveBeenCalledWith(
        client,
        'onSettingsSet',
        IPCMessage.failure('boom', 'corr-2')
      );
    });

    it('does nothing when client is falsy', async () => {
      await transport.handlers.get('settingsSet')!(
        { payload: { key: 'theme', value: 'light' }, correlationId: 'x' },
        undefined
      );

      expect(Core.settingsSet).not.toHaveBeenCalled();
      expect(transport.emit).not.toHaveBeenCalled();
    });
  });
});

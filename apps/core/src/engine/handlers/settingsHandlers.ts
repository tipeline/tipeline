import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerSettingsHandlers = (transport: ITransport) => {
  transport.on('settingsList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.settingsList();
      transport.emit(client, 'onSettingsList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onSettingsList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('settingsSet', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.settingsSet(message.payload.key, message.payload.value);
      transport.emit(client, 'onSettingsSet', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onSettingsSet', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  // Deliberately separate from settingsList (which excludes api_token) so clients
  // that need it for MCP auth can fetch it directly without it leaking into the
  // general settings dump.
  transport.on('settingsGetApiToken', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.getApiToken();
      transport.emit(client, 'onSettingsGetApiToken', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onSettingsGetApiToken', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

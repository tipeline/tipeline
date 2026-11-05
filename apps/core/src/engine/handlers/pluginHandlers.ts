import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerPluginHandlers = (transport: ITransport) => {
  transport.on('pluginList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginList();
      transport.emit(client, 'onPluginList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pluginDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginDetail(message.payload.identifier);
      transport.emit(client, 'onPluginDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pluginSetEnabled', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginSetEnabled(message.payload.identifier, message.payload.enabled);
      transport.emit(client, 'onPluginSetEnabled', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginSetEnabled', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pluginScan', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginScan();
      transport.emit(client, 'onPluginScan', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginScan', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pluginRemove', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginRemove(message.payload.identifier);
      transport.emit(client, 'onPluginRemove', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginRemove', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pluginUsage', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pluginUsage(message.payload.group);
      transport.emit(client, 'onPluginUsage', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPluginUsage', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

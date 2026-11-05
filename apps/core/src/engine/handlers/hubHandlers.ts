import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerHubHandlers = (transport: ITransport) => {
  transport.on('hubList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubList();
      transport.emit(client, 'onHubList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubAdd', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubAdd(message.payload);
      transport.emit(client, 'onHubAdd', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubAdd', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { id, ...data } = message.payload;
      const result = await Core.hubUpdate(id, data);
      transport.emit(client, 'onHubUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubRemove', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.hubRemove(message.payload.id);
      transport.emit(client, 'onHubRemove', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubRemove', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubSetEnabled', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { id, enabled } = message.payload;
      const result = await Core.hubSetEnabled(id, enabled);
      transport.emit(client, 'onHubSetEnabled', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubSetEnabled', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubCatalog', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubCatalog(message.payload.hubId);
      transport.emit(client, 'onHubCatalog', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubCatalog', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubPreviewTask', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { hubId, itemIdentifier } = message.payload;
      const result = await Core.hubPreviewTask(hubId, itemIdentifier);
      transport.emit(client, 'onHubPreviewTask', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubPreviewTask', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubInstallTask', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { hubId, itemIdentifier } = message.payload;
      const result = await Core.hubInstallTask(hubId, itemIdentifier);
      transport.emit(client, 'onHubInstallTask', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubInstallTask', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubInstallApp', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { hubId, itemIdentifier } = message.payload;
      const result = await Core.hubInstallApp(hubId, itemIdentifier);
      transport.emit(client, 'onHubInstallApp', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubInstallApp', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubInstallPlugin', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { hubId, itemIdentifier } = message.payload;
      const result = await Core.hubInstallPlugin(hubId, itemIdentifier);
      transport.emit(client, 'onHubInstallPlugin', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubInstallPlugin', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdateTask', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubUpdateTask(message.payload.identifier);
      transport.emit(client, 'onHubUpdateTask', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdateTask', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubPreviewUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { type, identifier } = message.payload;
      const result = await Core.hubPreviewUpdate(type, identifier);
      transport.emit(client, 'onHubPreviewUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubPreviewUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdateEvents', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubUpdateEvents();
      transport.emit(client, 'onHubUpdateEvents', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdateEvents', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdateEventsRead', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.hubUpdateEventsRead();
      transport.emit(client, 'onHubUpdateEventsRead', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdateEventsRead', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdateApp', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubUpdateApp(message.payload.identifier);
      transport.emit(client, 'onHubUpdateApp', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdateApp', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubUpdatePlugin', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubUpdatePlugin(message.payload.identifier);
      transport.emit(client, 'onHubUpdatePlugin', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubUpdatePlugin', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubCheckAll', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubCheckAll();
      transport.emit(client, 'onHubCheckAll', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubCheckAll', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubCheckOne', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.hubCheckOne(message.payload.hubId);
      transport.emit(client, 'onHubCheckOne', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubCheckOne', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubSetTaskAutoUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, autoUpdate } = message.payload;
      const result = await Core.hubSetTaskAutoUpdate(identifier, autoUpdate);
      transport.emit(client, 'onHubSetTaskAutoUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubSetTaskAutoUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubSetAppAutoUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, autoUpdate } = message.payload;
      const result = await Core.hubSetAppAutoUpdate(identifier, autoUpdate);
      transport.emit(client, 'onHubSetAppAutoUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubSetAppAutoUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('hubSetPluginAutoUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, autoUpdate } = message.payload;
      const result = await Core.hubSetPluginAutoUpdate(identifier, autoUpdate);
      transport.emit(client, 'onHubSetPluginAutoUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onHubSetPluginAutoUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

import IPCMessage from '@engine/IPCMessage';
import { ConnectionService } from '@database/services/ConnectionService';
import type { ITransport } from '@engine/ITransport';
import { CORE_VERSION } from '@utils/coreVersion';

export const registerConnectionHandlers = (transport: ITransport) => {
  transport.on('connectionList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await ConnectionService.list();
      transport.emit(client, 'onConnectionList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onConnectionList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('connectionAdd', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { name, host, token } = message.payload;
      const result = await ConnectionService.add(name, host, token);
      transport.emit(client, 'onConnectionAdd', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onConnectionAdd', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('connectionRemove', async (message: any, client: any) => {
    if (!client) return;
    try {
      await ConnectionService.remove(message.payload.id);
      transport.emit(client, 'onConnectionRemove', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onConnectionRemove', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('connectionGetActive', async (message: any, client: any) => {
    if (!client) return;
    try {
      const [activeId, connection] = await Promise.all([
        ConnectionService.getActiveId(),
        ConnectionService.getActive(),
      ]);
      transport.emit(
        client,
        'onConnectionGetActive',
        IPCMessage.success({ activeId, connection, coreVersion: CORE_VERSION }, message.correlationId)
      );
    } catch (error: any) {
      transport.emit(
        client,
        'onConnectionGetActive',
        IPCMessage.failure(error.message, message.correlationId)
      );
    }
  });

  transport.on('connectionUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { id, ...data } = message.payload;
      const result = await ConnectionService.update(id, data);
      transport.emit(client, 'onConnectionUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onConnectionUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('connectionSetActive', async (message: any, client: any) => {
    if (!client) return;
    try {
      await ConnectionService.setActive(message.payload.id);
      transport.emit(client, 'onConnectionSetActive', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(
        client,
        'onConnectionSetActive',
        IPCMessage.failure(error.message, message.correlationId)
      );
    }
  });
};

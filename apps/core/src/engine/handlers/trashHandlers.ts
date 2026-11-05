import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerTrashHandlers = (transport: ITransport) => {
  transport.on('trashList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.trashList();
      transport.emit(client, 'onTrashList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTrashList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('trashRestore', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.trashRestore(message.payload.id);
      transport.emit(client, 'onTrashRestore', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTrashRestore', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('trashDelete', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.trashDelete(message.payload.ids);
      transport.emit(client, 'onTrashDelete', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTrashDelete', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('trashEmpty', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.trashEmpty();
      transport.emit(client, 'onTrashEmpty', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTrashEmpty', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

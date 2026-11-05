import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerTagHandlers = (transport: ITransport) => {
  transport.on('tagNew', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.tagNew(message.payload);
      transport.emit(client, 'onTagNew', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTagNew', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('tagRename', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.tagRename(message.payload);
      transport.emit(client, 'onTagRename', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTagRename', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('tagList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.tagList();
      transport.emit(client, 'onTagList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTagList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('tagDelete', async (message: any, client: any) => {
    if (!client) return;
    try {
      if (!message.payload) {
        transport.emit(client, 'onTagDelete', IPCMessage.failure('payload is required', message.correlationId));
        return;
      }
      const result = await Core.tagDelete(message.payload.id);
      transport.emit(client, 'onTagDelete', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTagDelete', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

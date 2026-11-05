import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerCacheHandlers = (transport: ITransport) => {
  transport.on('cacheList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.cacheList(message.payload ?? {});
      transport.emit(client, 'onCacheList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onCacheList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('cacheClear', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.cacheClear(message.payload ?? {});
      transport.emit(client, 'onCacheClear', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onCacheClear', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

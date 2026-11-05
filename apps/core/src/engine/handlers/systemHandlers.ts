import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';


export type ShutdownFn = (options?: { interrupt?: boolean }) => Promise<void>;

export const registerSystemHandlers = (transport: ITransport, shutdown: ShutdownFn) => {
  transport.on('status', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.status();
      transport.emit(client, 'onStatus', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onStatus', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('stop', async (message: any, client: any) => {
    if (!client) return;
    try {
      transport.emit(client, 'onStop', IPCMessage.success(null, message.correlationId));
      await shutdown({ interrupt: message.payload?.interrupt === true });
    } catch (error: any) {
      transport.emit(client, 'onStop', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';
import { resolveScheduleTiming } from '@engine/runner/scheduleTiming';

export const registerScheduleHandlers = (transport: ITransport) => {
  transport.on('scheduleSet', async (message: any, client: any) => {
    if (!client) return;
    try {
      // `when` is plain words or a cron ("every weekday at 9am"); `cron` and `runAt`
      // (an ISO time to run once) are what Desktop sends after its own preview.
      const { identifier, when, cron, runAt, everySeconds, variables } = message.payload;
      let timing: ReturnType<typeof resolveScheduleTiming>;
      try {
        timing = resolveScheduleTiming({ when, cron, runAt, everySeconds });
      } catch (error: any) {
        transport.emit(client, 'onScheduleSet', IPCMessage.failure(error.message, message.correlationId));
        return;
      }
      const scheduleIdentifier = await Core.scheduleSet(identifier, { ...timing, variables });
      transport.emit(
        client,
        'onScheduleSet',
        IPCMessage.success(
          { scheduleIdentifier, taskIdentifier: message.payload.identifier },
          message.correlationId
        )
      );
    } catch (error: any) {
      transport.emit(client, 'onScheduleSet', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('scheduleRemove', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.scheduleRemove(message.payload.scheduleIdentifier);
      transport.emit(
        client,
        'onScheduleRemove',
        IPCMessage.success(
          `Schedule ${message.payload.scheduleIdentifier} removed`,
          message.correlationId
        )
      );
    } catch (error: any) {
      transport.emit(client, 'onScheduleRemove', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('scheduleToggle', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { scheduleIdentifier, enabled } = message.payload;
      await Core.scheduleToggle(scheduleIdentifier, enabled);
      transport.emit(
        client,
        'onScheduleToggle',
        IPCMessage.success({ scheduleIdentifier, enabled }, message.correlationId)
      );
    } catch (error: any) {
      transport.emit(client, 'onScheduleToggle', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('scheduleList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.scheduleList();
      transport.emit(client, 'onScheduleList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onScheduleList', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

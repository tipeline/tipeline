import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import { generateIdentifier } from '@tipeline/utils';
import { TaskStreamListener } from '@engine/TaskStreamListener';
import type { ITransport } from '@engine/ITransport';

type BroadcastFn = (event: string, data: any) => void;

export const registerPipelineHandlers = (transport: ITransport, broadcast: BroadcastFn) => {
  transport.on('pipelineList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineList(
        message.payload.taskIdentifier,
        message.payload.limit,
        message.payload.offset,
        typeof message.payload.status === 'string' ? message.payload.status : undefined
      );
      transport.emit(client, 'onPipelineList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineStats', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineStats(message.payload?.boundaries);
      transport.emit(client, 'onPipelineStats', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineStats', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineDetail(message.payload.pipelineIdentifier);
      transport.emit(client, 'onPipelineDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineClear', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineClear(message.payload.taskIdentifier);
      transport.emit(client, 'onPipelineClear', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineClear', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineCancel', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineCancel(message.payload ?? {});
      transport.emit(client, 'onPipelineCancel', IPCMessage.success(result, message.correlationId));
      // A run canceled while waiting for an approval has no job to announce its end — do
      // it here, so run lists, run pages and the Approvals badge update everywhere.
      if (result.status === 'canceled') {
        broadcast(
          'onTaskEnd',
          IPCMessage.success(
            {
              pipelineIdentifier: result.pipelineIdentifier,
              taskIdentifier: result.taskIdentifier,
              status: 'canceled',
            },
            generateIdentifier()
          )
        );
      }
    } catch (error: any) {
      transport.emit(client, 'onPipelineCancel', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineClearAll', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineClearAll();
      transport.emit(client, 'onPipelineClearAll', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineClearAll', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineDelete', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.pipelineDelete(message.payload?.identifiers);
      transport.emit(client, 'onPipelineDelete', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onPipelineDelete', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('pipelineResume', async (message: any, client: any) => {
    if (!client) return;
    const listener = new TaskStreamListener(message.correlationId, broadcast);
    listener.bind();
    try {
      if (message.payload?.checkVariables) {
        await Core.checkRunVariables(
          { pipelineIdentifier: message.payload.pipelineIdentifier },
          message.payload.variables
        );
      }
      await Core.pipelineResume(
        message.payload.pipelineIdentifier,
        message.correlationId,
        message.payload.variables ?? {}
      );
      broadcast('onTaskEndAll', IPCMessage.success('Workflow finished successfully', message.correlationId));
    } catch (error: any) {
      broadcast('onTaskError', IPCMessage.failure(error.message, message.correlationId));
    } finally {
      listener.unbind();
    }
  });
};

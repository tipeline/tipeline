import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';
import type { TipelineMcpServer } from '@engine/McpServer';

export const registerAgentHandlers = (transport: ITransport, tools: TipelineMcpServer) => {
  // The assistant's tools for the Tipeline Server, which runs the assistant for its users: the
  // same tools as the MCP endpoint, minus what the asking user may not see (`exclude`).
  transport.on('agentToolList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await tools.listToolsInProcess();
      transport.emit(client, 'onAgentToolList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentToolList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentToolCall', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { name, arguments: args, exclude, runCorrelationId } = message.payload ?? {};
      if (typeof name !== 'string' || !name) throw new Error('A tool name is required');
      const result = await tools.callToolInProcess(name, args ?? {}, {
        exclude: new Set(Array.isArray(exclude) ? exclude.map(String) : []),
        runCorrelationId: typeof runCorrelationId === 'string' && runCorrelationId ? runCorrelationId : undefined,
      });
      transport.emit(client, 'onAgentToolCall', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentToolCall', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunCreate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.agentRunCreate(message.payload.correlationId, message.payload.prompt);
      transport.emit(client, 'onAgentRunCreate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunCreate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunMarkProposed', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { correlationId, taskIdentifier, answer, taskName } = message.payload;
      await Core.agentRunMarkProposed(correlationId, taskIdentifier ?? null, answer ?? '', taskName);
      transport.emit(client, 'onAgentRunMarkProposed', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunMarkProposed', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunMarkTaskRunning', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.agentRunMarkTaskRunning(message.payload.correlationId, message.payload.taskIdentifier);
      transport.emit(client, 'onAgentRunMarkTaskRunning', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunMarkTaskRunning', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunSetPipeline', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.agentRunSetPipeline(message.payload.correlationId, message.payload.pipelineIdentifier);
      transport.emit(client, 'onAgentRunSetPipeline', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunSetPipeline', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunComplete', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.agentRunComplete(message.payload.correlationId, message.payload.answer);
      transport.emit(client, 'onAgentRunComplete', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunComplete', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunFail', async (message: any, client: any) => {
    if (!client) return;
    try {
      await Core.agentRunFail(message.payload.correlationId, message.payload.error);
      transport.emit(client, 'onAgentRunFail', IPCMessage.success(null, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunFail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('assistantFindability', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.assistantFindability();
      transport.emit(client, 'onAssistantFindability', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAssistantFindability', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('agentRunList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.agentRunList();
      transport.emit(client, 'onAgentRunList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onAgentRunList', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

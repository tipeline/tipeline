import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerVariableHandlers = (transport: ITransport) => {
  transport.on('variableNew', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.variableNew(message.payload);
      transport.emit(client, 'onVariableNew', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableNew', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableEdit', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.variableEdit(message.payload);
      transport.emit(client, 'onVariableEdit', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableEdit', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableDuplicate', async (message: any, client: any) => {
    if (!client) return;
    try {
      if (!message.payload) {
        transport.emit(client, 'onVariableDuplicate', IPCMessage.failure('payload is required', message.correlationId));
        return;
      }
      const result = await Core.variableDuplicate(message.payload.identifier, message.payload.name);
      transport.emit(client, 'onVariableDuplicate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableDuplicate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.variableList();
      transport.emit(client, 'onVariableList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableExportAll', async (message: any, client: any) => {
    if (!client) return;
    try {
      const targetPath = typeof message.payload === 'string' ? message.payload : message.payload?.targetPath;
      const includeSecrets = typeof message.payload === 'object' ? !!message.payload?.includeSecrets : false;
      const result = await Core.variableExportAll(targetPath, includeSecrets);
      transport.emit(client, 'onVariableExportAll', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableExportAll', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableDelete', async (message: any, client: any) => {
    if (!client) return;
    try {
      if (!message.payload) {
        transport.emit(client, 'onVariableDelete', IPCMessage.failure('payload is required', message.correlationId));
        return;
      }
      const result = await Core.variableDelete(message.payload.identifier);
      transport.emit(client, 'onVariableDelete', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableDelete', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('variableUsage', async (message: any, client: any) => {
    if (!client) return;
    try {
      if (!message.payload?.name) {
        transport.emit(client, 'onVariableUsage', IPCMessage.failure('payload.name is required', message.correlationId));
        return;
      }
      const result = await Core.variableUsage(message.payload.name);
      transport.emit(client, 'onVariableUsage', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onVariableUsage', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

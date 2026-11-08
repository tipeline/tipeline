import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerProjectHandlers = (transport: ITransport) => {
  transport.on('projectList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectList();
      transport.emit(client, 'onProjectList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectNew', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectNew(message.payload);
      transport.emit(client, 'onProjectNew', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectNew', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectDetail(message.payload.identifier);
      transport.emit(client, 'onProjectDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectUpdate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectUpdate(message.payload.identifier, message.payload.data);
      transport.emit(client, 'onProjectUpdate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectUpdate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectDeletePreview', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectDeletePreview(message.payload.identifier);
      transport.emit(client, 'onProjectDeletePreview', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectDeletePreview', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectDelete', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, workflows, apps } = message.payload;
      // Without lists, its workflows and apps are kept.
      const result =
        workflows || apps
          ? await Core.projectDelete(identifier, { workflows, apps })
          : await Core.projectDelete(identifier);
      transport.emit(client, 'onProjectDelete', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectDelete', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectAssignTask', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectAssignTask(message.payload.projectIdentifier, message.payload.taskIdentifier);
      transport.emit(client, 'onProjectAssignTask', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectAssignTask', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectUnassignTask', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectUnassignTask(message.payload.taskIdentifier);
      transport.emit(client, 'onProjectUnassignTask', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectUnassignTask', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectAssignApp', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectAssignApp(message.payload.projectIdentifier, message.payload.appIdentifier);
      transport.emit(client, 'onProjectAssignApp', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectAssignApp', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectUnassignApp', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectUnassignApp(message.payload.appIdentifier);
      transport.emit(client, 'onProjectUnassignApp', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectUnassignApp', IPCMessage.failure(error.message, message.correlationId));
    }
  });
  transport.on('projectMap', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectMap(message.payload?.identifier ?? null);
      transport.emit(client, 'onProjectMap', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectMap', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectMapSave', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.projectMapSave(message.payload.identifier, message.payload.plan);
      transport.emit(client, 'onProjectMapSave', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectMapSave', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectMapLink', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, nodeId, key } = message.payload;
      const result = await Core.projectMapLink(identifier, nodeId, key);
      transport.emit(client, 'onProjectMapLink', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectMapLink', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import { TaskStreamListener } from '@engine/TaskStreamListener';
import { DebugController } from '@engine/DebugController';
import { coreEvents } from '@engine/CoreEvents';
import { ActionError } from '@utils/ActionError';
import type { ITransport } from '@engine/ITransport';
import { toCacheMode } from '@/cache/cacheMode';

type BroadcastFn = (event: string, data: any) => void;

export const registerTaskHandlers = (transport: ITransport, broadcast: BroadcastFn) => {
  transport.on('taskList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskList();
      transport.emit(client, 'onTaskList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('scriptPreview', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.scriptPreview(message.payload);
      transport.emit(client, 'onScriptPreview', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onScriptPreview', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskUpdateSource', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskUpdateSource(
        message.payload.identifier,
        message.payload.source
      );
      transport.emit(client, 'onTaskUpdateSource', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskUpdateSource', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskRevisionList', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskRevisionList(message.payload.identifier);
      transport.emit(client, 'onTaskRevisionList', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskRevisionList', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskRevisionDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskRevisionDetail(message.payload.identifier, message.payload.revisionId);
      transport.emit(client, 'onTaskRevisionDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskRevisionDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskRevisionRestore', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskRevisionRestore(message.payload.identifier, message.payload.revisionId);
      transport.emit(client, 'onTaskRevisionRestore', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskRevisionRestore', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskNew', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskNew(message.payload.data);
      transport.emit(client, 'onTaskNew', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskNew', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskDuplicate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskDuplicate(message.payload.identifier, message.payload.name);
      transport.emit(client, 'onTaskDuplicate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskDuplicate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskDetail', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskDetail(message.payload.identifier, !!message.payload.capabilities);
      transport.emit(client, 'onTaskDetail', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskDetail', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskUsage', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskUsage(message.payload.identifier);
      transport.emit(client, 'onTaskUsage', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskUsage', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskCapabilities', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskCapabilities(message.payload.identifier);
      transport.emit(client, 'onTaskCapabilities', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskCapabilities', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskCapabilityIndex', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskCapabilityIndex();
      transport.emit(client, 'onTaskCapabilityIndex', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskCapabilityIndex', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskValidate', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = message.payload.content
        ? await Core.taskValidateContent(message.payload.content)
        : await Core.taskValidate(message.payload.source);
      transport.emit(client, 'onTaskValidate', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskValidate', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskInstall', async (message: any, client: any) => {
    if (!client) return;
    try {
      const payload = message.payload;
      const result =
        payload && typeof payload === 'object' && 'content' in payload
          ? payload.fromElsewhere
            ? await Core.taskInstallFromContent(payload.content, undefined, undefined, true)
            : await Core.taskInstallFromContent(payload.content, payload.baseDir)
          : await Core.taskInstall(typeof message === 'string' ? message : payload);
      transport.emit(
        client,
        'onTaskInstall',
        IPCMessage.success(`Workflow installed successfully: ${result.identifier}`, message.correlationId)
      );
    } catch (error: any) {
      transport.emit(client, 'onTaskInstall', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskReload', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = message.payload.content
        ? await Core.taskReloadContent(message.payload.identifier, message.payload.content)
        : await Core.taskReload(message.payload.identifier, message.payload.path);
      transport.emit(
        client,
        'onTaskReload',
        IPCMessage.success(`Workflow reloaded successfully: ${result?.identifier}`, message.correlationId)
      );
    } catch (error: any) {
      transport.emit(client, 'onTaskReload', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskUpdateMeta', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, ...data } = message.payload;
      const result = await Core.taskUpdateMeta(identifier, data);
      transport.emit(client, 'onTaskUpdateMeta', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskUpdateMeta', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskUploadImage', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskUploadImage(message.payload.identifier, message.payload.dataUrl);
      transport.emit(client, 'onTaskUploadImage', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskUploadImage', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskExport', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = message.payload.returnContent
        ? await Core.taskExportContent(message.payload.identifier, !!message.payload.includeSecrets)
        : await Core.taskExport(
        message.payload.identifier,
        message.payload.targetPath,
        ...((message.payload.includeSecrets ? [true] : []) as [boolean?])
      );
      transport.emit(client, 'onTaskExport', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskExport', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskExportAll', async (message: any, client: any) => {
    if (!client) return;
    try {
      const targetPath = typeof message.payload === 'string' ? message.payload : message.payload?.targetPath;
      const result = message.payload?.returnContent
        ? await Core.taskExportAllContent(!!message.payload.includeSecrets)
        : await Core.taskExportAll(
        targetPath,
        ...((message.payload?.includeSecrets ? [true] : []) as [boolean?])
      );
      transport.emit(client, 'onTaskExportAll', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskExportAll', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskUninstall', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskUninstall(message.payload.identifier);
      transport.emit(
        client,
        'onTaskUninstall',
        IPCMessage.success({ ...result, message: 'Workflow moved to the Trash' }, message.correlationId)
      );
    } catch (error: any) {
      transport.emit(client, 'onTaskUninstall', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('taskMarkReady', async (message: any, client: any) => {
    if (!client) return;
    try {
      const result = await Core.taskMarkReady(message.payload.identifier, !!message.payload.withSchedule);
      transport.emit(client, 'onTaskMarkReady', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onTaskMarkReady', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('exec', async (message: any, client: any) => {
    if (!client) return;
    const listener = new TaskStreamListener(message.correlationId, broadcast);
    listener.bind();
    try {
      if (message.payload?.checkVariables) {
        await Core.checkRunVariables({ identifier: message.payload.identifier }, message.payload.variables);
      }
      await Core.exec(
        message.payload.identifier,
        message.correlationId,
        message.payload?.variables ?? {},
        message.payload?.stepMode ?? false,
        message.payload?.debugMode ?? false,
        // Started directly by someone in Desktop or the CLI, so a draft may run (to test it).
        {
          cacheMode: toCacheMode(message.payload?.cache),
          allowDraft: true,
          breakpoints: Array.isArray(message.payload?.breakpoints)
            ? message.payload.breakpoints.filter((b: unknown) => typeof b === 'string')
            : undefined,
        }
      );
      broadcast('onTaskEndAll', IPCMessage.success('Workflow finished successfully', message.correlationId));
    } catch (error: any) {
      broadcast(
        'onTaskError',
        IPCMessage.failure(
          error instanceof ActionError ? error.toData() : (error.message ?? String(error)),
          message.correlationId
        )
      );
    } finally {
      listener.unbind();
      DebugController.cleanup(message.correlationId);
    }
  });

  transport.on('debugNext', (message: any) => {
    coreEvents.emit(`debug:next:${message.correlationId}`);
  });

  transport.on('debugRun', (message: any) => {
    coreEvents.emit(`debug:run:${message.correlationId}`);
  });

  transport.on('debugPause', (message: any) => {
    coreEvents.emit(`debug:pause:${message.correlationId}`);
  });

  transport.on('debugStop', (message: any) => {
    coreEvents.emit(`debug:stop:${message.correlationId}`);
  });

  // The debugger's other commands (skip, next pass, retry, breakpoints, edited step
  // settings, a variable's new value): { command, ... } — see DebugController.
  transport.on('debugCommand', (message: any) => {
    if (typeof message.payload?.command !== 'string') return;
    coreEvents.emit(`debug:command:${message.correlationId}`, message.payload);
  });

  transport.on('run', async (message: any, client: any) => {
    if (!client) return;
    const listener = new TaskStreamListener(message.correlationId, broadcast);
    listener.bind();
    try {
      if (message.payload?.checkVariables) {
        await Core.checkRunVariables(
          message.payload.content ? { content: message.payload.content } : { source: message.payload.source },
          message.payload.variables
        );
      }
      await Core.run(message.payload, message.correlationId);
      broadcast('onTaskEndAll', IPCMessage.success('Workflow finished successfully', message.correlationId));
    } catch (error: any) {
      broadcast(
        'onTaskError',
        IPCMessage.failure(
          error instanceof ActionError ? error.toData() : (error.message ?? String(error)),
          message.correlationId
        )
      );
    } finally {
      listener.unbind();
    }
  });
};

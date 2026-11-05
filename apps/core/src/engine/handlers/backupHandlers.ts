import IPCMessage from '@engine/IPCMessage';
import Core from '@engine/Core';
import type { ITransport } from '@engine/ITransport';

export const registerBackupHandlers = (transport: ITransport) => {
  transport.on('fullBackup', async (message: any, client: any) => {
    if (!client) return;
    try {
      const targetPath = typeof message.payload === 'string' ? message.payload : message.payload?.targetPath;
      const includeSecrets = typeof message.payload === 'object' ? !!message.payload?.includeSecrets : false;
      const result = await Core.fullBackup(targetPath, includeSecrets);
      transport.emit(client, 'onFullBackup', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onFullBackup', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('fullRestore', async (message: any, client: any) => {
    if (!client) return;
    try {
      const archivePath = typeof message.payload === 'string' ? message.payload : message.payload?.archivePath;
      const mode = message.payload?.mode === 'replace' ? 'replace' : 'skip';
      const result = await Core.fullRestore(archivePath, mode);
      transport.emit(client, 'onFullRestore', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onFullRestore', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('backupCapabilities', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { archivePath, projectOnly } = message.payload ?? {};
      const result = await Core.backupCapabilities(archivePath, !!projectOnly);
      transport.emit(client, 'onBackupCapabilities', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onBackupCapabilities', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectExport', async (message: any, client: any) => {
    if (!client) return;
    try {
      const { identifier, targetPath, includeSecrets } = message.payload ?? {};
      const result = await Core.projectExport(identifier, targetPath, !!includeSecrets);
      transport.emit(client, 'onProjectExport', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectExport', IPCMessage.failure(error.message, message.correlationId));
    }
  });

  transport.on('projectImport', async (message: any, client: any) => {
    if (!client) return;
    try {
      const archivePath = message.payload?.archivePath;
      const mode = message.payload?.mode === 'replace' ? 'replace' : 'skip';
      const result = await Core.projectImport(archivePath, mode);
      transport.emit(client, 'onProjectImport', IPCMessage.success(result, message.correlationId));
    } catch (error: any) {
      transport.emit(client, 'onProjectImport', IPCMessage.failure(error.message, message.correlationId));
    }
  });
};

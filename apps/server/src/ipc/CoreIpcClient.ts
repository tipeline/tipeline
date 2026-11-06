import ipc from 'node-ipc';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Core now requires every IPC client to authenticate before it will dispatch any other
// event — this is the token Core writes to disk on startup, not fetched over IPC itself
// (that would require IPC to stay unauthenticated for the fetch).
function readCoreToken(): string {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.tipeline', '.database', 'core.token'), 'utf8').trim();
  } catch {
    return '';
  }
}

const CORE_EVENTS = [
  // Tasks
  'onTaskList', 'onTaskDetail', 'onTaskUsage', 'onTaskCapabilities', 'onTaskNew', 'onTaskDuplicate',
  'onTaskUpdateSource', 'onTaskUpdateMeta', 'onTaskValidate', 'onTaskInstall',
  'onTaskExportAll', 'onTaskReload', 'onTaskUninstall', 'onTaskUploadImage',
  // Execution stream
  'onTaskStart', 'onAction', 'onActionError', 'onTaskEnd', 'onTaskError', 'onTaskEndAll',
  'onDebugPaused',
  // Pipelines
  'onPipelineList', 'onPipelineDetail', 'onPipelineStats', 'onPipelineClear', 'onPipelineClearAll', 'onPipelineDelete', 'onPipelineCancel',
  // Apps
  'onAppList', 'onAppDetail', 'onAppNew', 'onAppUpdateSource', 'onAppUpdateMeta',
  'onAppUploadImage', 'onAppInstall', 'onAppExport', 'onAppUninstall', 'onTableDataFetch', 'onAppHistoryFetch',
  // Approvals
  'onApprovalList', 'onApprovalDecide', 'onAppApprovalList', 'onAppApprovalDecide', 'onApprovalHistory',
  'onAppRunsActive', 'onAppRunsList',
  // Variables
  'onVariableList', 'onVariableNew', 'onVariableEdit', 'onVariableDuplicate',
  'onVariableDelete', 'onVariableUsage', 'onVariableExportAll',
  // Backup
  'onFullBackup', 'onFullRestore', 'onBackupCapabilities',
  // Tags
  'onTagList', 'onTagNew', 'onTagRename', 'onTagDelete',
  // Schedules
  'onScheduleList', 'onScheduleSet', 'onScheduleRemove', 'onScheduleToggle',
  // System
  'onStatus', 'onStop',
  // Settings
  'onSettingsList', 'onSettingsSet', 'onSettingsGetApiToken',
  // Plugins
  'onPluginList', 'onPluginScan', 'onPluginDetail', 'onPluginSetEnabled', 'onPluginRemove', 'onPluginUsage',
  // Projects
  'onProjectList', 'onProjectNew', 'onProjectDetail', 'onProjectUpdate', 'onProjectDelete', 'onProjectDeletePreview',
  'onProjectAssignTask', 'onProjectUnassignTask', 'onProjectAssignApp', 'onProjectUnassignApp',
  'onProjectExport', 'onProjectImport',
  // Agent run history
  'onAgentRunCreate', 'onAgentRunMarkTaskRunning', 'onAgentRunSetPipeline',
  'onAgentRunComplete', 'onAgentRunFail', 'onAgentRunList',
  // Connections
  'onConnectionList', 'onConnectionAdd', 'onConnectionRemove', 'onConnectionUpdate',
  'onConnectionSetActive', 'onConnectionGetActive',
  // Hubs
  'onHubList', 'onHubAdd', 'onHubRemove', 'onHubUpdate', 'onHubSetEnabled',
  'onHubCatalog', 'onHubInstallTask', 'onHubInstallApp', 'onHubInstallPlugin',
  'onHubUpdateTask', 'onHubUpdateApp', 'onHubUpdatePlugin',
  'onHubPreviewUpdate', 'onHubUpdateEvents', 'onHubUpdateEventsRead',
  'onHubCheckAll', 'onHubCheckOne',
  'onHubSetTaskAutoUpdate', 'onHubSetAppAutoUpdate', 'onHubSetPluginAutoUpdate',
  // Result cache
  'onCacheList', 'onCacheClear',
  // Workflow versions + Trash
  'onTaskRevisionList', 'onTaskRevisionDetail', 'onTaskRevisionRestore',
  'onTrashList', 'onTrashRestore', 'onTrashDelete', 'onTrashEmpty',
] as const;

type CoreEvent = typeof CORE_EVENTS[number];

export class CoreIpcClient {
  private conn: any = null;
  private isConnected = false;
  private readonly handlers = new Map<CoreEvent, (data: any) => void>();
  private readonly messageQueue: Array<{ event: string; payload: any }> = [];
  // The gateway's own lookups (see request()): resolved here, never routed to clients.
  private readonly pendingRequests = new Map<string, { resolve: (data: any) => void; reject: (e: Error) => void }>();
  private requestSeq = 0;

  on(event: CoreEvent, handler: (data: any) => void): void {
    this.handlers.set(event, handler);
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      ipc.config.id = 'tipeline_server';
      ipc.config.retry = 1500;
      ipc.config.silent = true;
      if (process.env.TIPELINE_IPC_SOCKET_ROOT) {
        ipc.config.socketRoot = process.env.TIPELINE_IPC_SOCKET_ROOT;
      }

      ipc.connectTo('tipeline_core', () => {
        const conn = ipc.of['tipeline_core'];

        conn.on('connect', () => {
          this.conn = ipc.of['tipeline_core'];
          this.isConnected = true;
          console.log('[CoreIpcClient] Connected to tipeline_core');
          this.conn.emit('authenticate', { token: readCoreToken() });
          this.attachHandlers();
          this.flushQueue();
          resolve();
        });

        conn.on('disconnect', () => {
          this.conn = null;
          this.isConnected = false;
          console.log('[CoreIpcClient] Disconnected from tipeline_core');
        });
      });
    });
  }

  private attachHandlers(): void {
    for (const event of CORE_EVENTS) {
      const handler = this.handlers.get(event);
      this.conn.on(event, (data: any) => {
        const pending = data?.correlationId ? this.pendingRequests.get(data.correlationId) : undefined;
        if (pending) {
          this.pendingRequests.delete(data.correlationId);
          if (data.error) pending.reject(new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error)));
          else pending.resolve(data.data);
          return;
        }
        handler?.(data);
      });
    }
  }

  /**
   * Asks core something on the gateway's own behalf (e.g. which workflow an app
   * runnable uses, to authorize it). The response is consumed here and never
   * reaches a WebSocket client.
   */
  request<T = any>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
    const correlationId = `gateway-${Date.now()}-${++this.requestSeq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Core did not answer ${event} in time`));
      }, timeoutMs);
      this.pendingRequests.set(correlationId, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send(event, { correlationId, payload });
    });
  }

  send(event: string, payload: any): void {
    if (!this.conn || !this.isConnected) {
      this.messageQueue.push({ event, payload });
      return;
    }
    this.conn.emit(event, payload);
  }

  private flushQueue(): void {
    const pending = this.messageQueue.splice(0);
    for (const { event, payload } of pending) {
      this.send(event, payload);
    }
  }
}

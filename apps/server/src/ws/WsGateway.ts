import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';
import { AuthService, type User } from '../auth/AuthService.js';
import type { CoreIpcClient } from '../ipc/CoreIpcClient.js';
import { TaskOwnershipService } from '../ownership/TaskOwnershipService.js';
import { PipelineAuditService, type TriggerType } from '../audit/PipelineAuditService.js';
import { hasPermission } from '../auth/Permissions.js';
import { withoutCredentialSettings, withoutSecretValues, withoutWrittenInSecrets } from './hideSecrets.js';
import { authorizeCancel } from './cancelAuthorization.js';
import { authorizeAppCommand, visibleAppWorkflows } from './appAuthorization.js';
import { authorizeDecision, visibleApprovals, visibleHistory, type PendingApprovalItem } from './approvalAuthorization.js';
import { AuditLogService } from '../audit/AuditLogService.js';
import { hideInProjectDetail, hideInProjectMap } from './hideWorkflows.js';

// Events in the middle of a run: the request stays routed to its connection. (A
// sub-workflow's onTaskEnd arrives mid-run too — only onTaskEndAll / onTaskError end it.)
const STREAM_EVENTS = new Set([
  'onTaskStart', 'onAction', 'onActionError', 'onDebugPaused', 'onTaskEnd',
]);

const OWNERSHIP_PROTECTED = new Set([
  'taskUpdateSource', 'taskUpdateMeta', 'taskUninstall', 'taskReload', 'taskRevisionRestore',
]);

// Additionally checked against *visibility*, not just ownership — reading or running a
// private task should be denied to non-owners, not just hidden from taskList.
// Adding a workflow to a project (or taking it out) is only a label: any workflow the user
// may see can go in any project, but not another user's private one.
const PRIVATE_TASK_GATED = new Set([
  'taskDetail', 'taskUsage', 'taskCapabilities', 'taskRevisionList', 'taskRevisionDetail', 'exec', 'taskValidate', 'taskDuplicate', 'taskUploadImage',
  'projectAssignTask', 'projectUnassignTask',
]);

const PROJECT_MEMBERSHIP = new Set(['projectAssignTask', 'projectUnassignTask']);

// Commands the 'viewer' role may send — everything else in ALLOWED_COMMANDS is a
// mutation or an execution, which "view only" is not meant to permit.
const VIEWER_ALLOWED = new Set([
  'taskList', 'taskDetail', 'taskUsage', 'taskCapabilities', 'taskRevisionList', 'taskRevisionDetail', 'pipelineList', 'pipelineDetail', 'pipelineStats',
  'appList', 'appDetail', 'tableDataFetch', 'appHistoryFetch', 'appRunsActive', 'appRunsList',
  // Deciding is checked per request: a viewer named as an approver may decide.
  'approvalList', 'approvalDecide', 'appApprovalList', 'appApprovalDecide', 'approvalHistory',
  'variableList', 'variableUsage',
  'tagList', 'scheduleList', 'status',
  // Without credentials: see routeHidingSecrets.
  'settingsList',
  'pluginList', 'pluginDetail', 'pluginUsage',
  'projectList', 'projectDetail', 'projectMap',
  'agentRunList',
  'hubList', 'hubCatalog', 'hubUpdateEvents',
]);

// Commands with instance-wide or supply-chain-level effect (halting the engine, rewriting
// integration credentials, pointing the instance at a new plugin/task source, disabling
// plugins, global settings, deleting projects) — these aren't scoped to a task an 'editor'
// might own, so ownership checks never apply to them. Require 'security:manage' (admin only)
// instead of leaving editor and admin undifferentiated.
const ADMIN_ONLY_COMMANDS = new Set([
  'stop',
  'settingsSet',
  // Core's own token gets past every role, and a remote's token gets into another Core.
  'settingsGetApiToken',
  'connectionList', 'connectionGetActive', 'connectionSetActive',
  'connectionAdd', 'connectionRemove', 'connectionUpdate',
  'hubAdd', 'hubRemove', 'hubUpdate', 'hubSetEnabled',
  'pluginRemove', 'pluginSetEnabled',
  'scheduleSet', 'scheduleRemove', 'scheduleToggle',
  'projectDelete', 'projectDeletePreview',
  // Every user's cached results at once (they'd be recomputed, but it's instance-wide).
  'cacheClear',
  // Reads every workflow, app and global variable (secrets in plain text if asked).
  'fullBackup',
  // Writes every workflow, app, project, schedule and global variable in the backup.
  'fullRestore',
  // Opens a file on the server's disk to read the workflows in it.
  'backupCapabilities',
  // Same as backup / restore, narrowed to one project (and the globals it uses).
  'projectExport', 'projectImport',
  // The Trash holds every user's deleted workflows and apps (owners aren't kept in Core).
  'trashList', 'trashRestore', 'trashDelete', 'trashEmpty',
]);

const SECRET_BEARING_ANSWERS = new Set(['onSettingsList', 'onVariableList', 'onTaskDetail', 'onTaskRevisionDetail']);

// Response events forwarded from Core to WS clients (must match CoreIpcClient CORE_EVENTS)
const ALL_CORE_EVENTS = [
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
  'onProjectExport', 'onProjectImport', 'onProjectMap', 'onProjectMapSave', 'onProjectMapLink',
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

// Command names (without on* prefix) that clients are allowed to send to Core
const ALLOWED_COMMANDS = new Set([
  // Tasks
  'taskList', 'taskDetail', 'taskUsage', 'taskCapabilities', 'taskNew', 'taskDuplicate',
  'taskUpdateSource', 'taskUpdateMeta', 'taskValidate', 'taskInstall',
  'taskRevisionList', 'taskRevisionDetail', 'taskRevisionRestore',
  'taskExportAll', 'taskReload', 'taskUninstall', 'taskUploadImage',
  // Execution
  'exec', 'debugNext', 'debugRun', 'debugPause', 'debugStop', 'debugCommand',
  // Pipelines
  'pipelineList', 'pipelineDetail', 'pipelineStats', 'pipelineResume', 'pipelineCancel', 'pipelineClear', 'pipelineClearAll', 'pipelineDelete',
  // Apps
  'appList', 'appDetail', 'appNew', 'appUpdateSource', 'appUpdateMeta',
  'appUploadImage', 'appInstall', 'appExport', 'appUninstall', 'tableDataFetch', 'appRun', 'appHistoryFetch',
  'appRunsActive', 'appRunsList',
  // Approvals
  'approvalList', 'approvalDecide', 'appApprovalList', 'appApprovalDecide', 'approvalHistory',
  // Variables
  'variableList', 'variableNew', 'variableEdit', 'variableDuplicate',
  'variableDelete', 'variableUsage', 'variableExportAll',
  // Backup
  'fullBackup', 'fullRestore', 'backupCapabilities',
  // Tags
  'tagList', 'tagNew', 'tagRename', 'tagDelete',
  // Schedules
  'scheduleList', 'scheduleSet', 'scheduleRemove', 'scheduleToggle',
  // System
  'status', 'stop',
  // Settings
  'settingsList', 'settingsSet', 'settingsGetApiToken',
  // Plugins
  'pluginList', 'pluginScan', 'pluginDetail', 'pluginSetEnabled', 'pluginRemove', 'pluginUsage',
  // Projects
  'projectList', 'projectNew', 'projectDetail', 'projectUpdate', 'projectDelete', 'projectDeletePreview',
  'projectAssignTask', 'projectUnassignTask', 'projectAssignApp', 'projectUnassignApp',
  'projectExport', 'projectImport', 'projectMap', 'projectMapSave', 'projectMapLink',
  // Agent
  'agentPrompt', 'agentRunList', 'agentRunSetPipeline',
  // Connections
  'connectionList', 'connectionAdd', 'connectionRemove', 'connectionUpdate',
  'connectionSetActive', 'connectionGetActive',
  // Hubs
  'hubList', 'hubAdd', 'hubRemove', 'hubUpdate', 'hubSetEnabled',
  'hubCatalog', 'hubInstallTask', 'hubInstallApp', 'hubInstallPlugin',
  'hubUpdateTask', 'hubUpdateApp', 'hubUpdatePlugin',
  'hubPreviewUpdate', 'hubUpdateEvents', 'hubUpdateEventsRead',
  'hubCheckAll', 'hubCheckOne',
  'hubSetTaskAutoUpdate', 'hubSetAppAutoUpdate', 'hubSetPluginAutoUpdate',
  // Result cache
  'cacheList', 'cacheClear',
  // Trash
  'trashList', 'trashRestore', 'trashDelete', 'trashEmpty',
]);

const APPROVAL_LISTS = new Set(['onApprovalList', 'onAppApprovalList', 'onApprovalHistory']);

interface PendingDecision {
  user: User;
  ip: string | null;
  item: PendingApprovalItem;
  approved: boolean;
  comment: string;
  appIdentifier: string | null;
}

interface PendingTrigger {
  type: TriggerType;
  ref: string | null;
  name: string | null;
  taskIdentifier: string;
  /** The signed-in user who started it (absent for webhooks and schedules). */
  requestedBy?: { id: string; email: string };
}

export class WsGateway {
  private clients = new Set<WebSocket>();
  private correlationMap = new Map<string, WebSocket>();
  private clientUser = new Map<WebSocket, User>();
  private pendingTriggers = new Map<string, PendingTrigger>();
  private pendingDecisions = new Map<string, PendingDecision>();

  constructor(private readonly coreClient: CoreIpcClient) {}

  registerWebhookTrigger(
    correlationId: string,
    webhookId: string,
    webhookName: string,
    taskIdentifier: string
  ): void {
    this.pendingTriggers.set(correlationId, {
      type: 'webhook',
      ref: webhookId,
      name: webhookName,
      taskIdentifier,
    });
  }

  attach(httpServer: Server): void {
    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const ip = req.socket.remoteAddress ?? null;

      // A client may send as soon as the connection opens, before the token check below is
      // done. The listener is attached first so that message waits instead of being lost.
      const token = this.extractToken(req);
      const authenticated = (token ? AuthService.validateToken(token) : Promise.resolve(null))
        .catch((err) => {
          console.error('[WsGateway] Token check failed:', err?.message ?? err);
          return null;
        })
        .then((user) => {
          if (!user) {
            ws.close(4001, 'Unauthorized');
            return false;
          }
          this.clients.add(ws);
          this.clientUser.set(ws, user);
          console.log(`[WsGateway] Client connected: ${user.email} (${this.clients.size} total)`);
          return true;
        });

      ws.on('message', async (raw) => {
        if (!(await authenticated)) return;
        try {
          const msg = JSON.parse(raw.toString());
          const { event, ...payload } = msg;
          const currentUser = this.clientUser.get(ws)!;

          if (!ALLOWED_COMMANDS.has(event)) {
            ws.send(JSON.stringify({ event: 'error', data: { message: `Unknown command: ${event}` } }));
            return;
          }

          // Answered on the command's own response event, like the ownership check
          // below, so the caller's pending request fails with this message instead
          // of waiting for its timeout. 'error' stays for clients that listen to it.
          const deny = (message: string) => {
            ws.send(JSON.stringify({ event: 'error', data: { message } }));
            if (!payload.correlationId) return;
            const responseEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
            ws.send(JSON.stringify({ event: responseEvent, correlationId: payload.correlationId, error: message }));
          };

          if (currentUser.role === 'viewer' && !VIEWER_ALLOWED.has(event)) {
            deny(`Permission denied: viewers cannot run "${event}"`);
            return;
          }

          if (ADMIN_ONLY_COMMANDS.has(event) && !hasPermission(currentUser.role, 'security:manage')) {
            deny(`Permission denied: "${event}" requires an admin.`);
            return;
          }

          if (payload.correlationId) {
            this.correlationMap.set(payload.correlationId, ws);
          }

          if ((OWNERSHIP_PROTECTED.has(event) || PRIVATE_TASK_GATED.has(event)) && currentUser.role !== 'admin') {
            const taskId = PROJECT_MEMBERSHIP.has(event) ? payload.payload?.taskIdentifier : payload.payload?.identifier;
            if (taskId) {
              const owner = await TaskOwnershipService.getOwner(taskId);
              if (owner && owner.user_id !== currentUser.id) {
                const isPrivate = owner.visibility === 'private';
                const isMutation = OWNERSHIP_PROTECTED.has(event);
                if (isPrivate || isMutation) {
                  const responseEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
                  ws.send(
                    JSON.stringify({
                      event: responseEvent,
                      correlationId: payload.correlationId,
                      // Private tasks get a vague "not found" so a non-owner can't confirm
                      // one exists or who owns it just by probing identifiers.
                      error: isPrivate ? 'Workflow not found' : `Permission denied: workflow is owned by ${owner.user_email}`,
                    })
                  );
                  return;
                }
              }
            }
          }

          // Runs of an app's workflows: only those the user may see (an empty list
          // means none to Core — it never widens to all).
          if (event === 'appRunsList') {
            const visible = await visibleAppWorkflows(payload.payload, currentUser, {
              getApp: (identifier) => this.coreClient.request('appDetail', { identifier }),
              getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
            });
            if (!visible) {
              if (payload.correlationId) this.correlationMap.delete(payload.correlationId);
              ws.send(JSON.stringify({ event: 'onAppRunsList', correlationId: payload.correlationId, error: 'App not found' }));
              return;
            }
            payload.payload = { ...payload.payload, workflows: visible.aliases };
          }

          if (event === 'tableDataFetch' || event === 'appRun' || event === 'appHistoryFetch') {
            const auth = await authorizeAppCommand(event, payload.payload, currentUser, {
              getApp: (identifier) => this.coreClient.request('appDetail', { identifier }),
              getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
            });
            if (!auth.allowed) {
              if (payload.correlationId) this.correlationMap.delete(payload.correlationId);
              // appRun is a stream: its failure arrives as onTaskError like any run's.
              const responseEvent = event === 'appRun' ? 'onTaskError' : `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
              ws.send(JSON.stringify({ event: responseEvent, correlationId: payload.correlationId, error: auth.error }));
              return;
            }
            if (event === 'appRun' && payload.correlationId && auth.taskIdentifier) {
              this.pendingTriggers.set(payload.correlationId, {
                type: 'app',
                ref: payload.payload?.appIdentifier ?? null,
                name: `${currentUser.email} · ${auth.appName} › ${payload.payload?.runnable ?? ''}`,
                taskIdentifier: auth.taskIdentifier,
                requestedBy: { id: currentUser.id, email: currentUser.email },
              });
            }
          }

          if (event === 'approvalDecide' || event === 'appApprovalDecide') {
            const params = payload.payload ?? {};
            const responseEvent = `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;
            const deny = (error: string) => {
              if (payload.correlationId) this.correlationMap.delete(payload.correlationId);
              ws.send(JSON.stringify({ event: responseEvent, correlationId: payload.correlationId, error }));
            };
            let pending: PendingApprovalItem[];
            try {
              pending =
                event === 'approvalDecide'
                  ? await this.coreClient.request('approvalList', {})
                  : await this.coreClient.request('appApprovalList', { appIdentifier: params.appIdentifier });
            } catch (error: any) {
              deny(error?.message ?? 'Could not read pending approvals');
              return;
            }
            const auth = await authorizeDecision(params.pipelineIdentifier, pending ?? [], currentUser, {
              getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
              getRequester: (pipelineIdentifier) => PipelineAuditService.getRequester(pipelineIdentifier),
            });
            if (!auth.allowed) {
              deny(auth.error);
              return;
            }
            const approved = params.approved === true;
            const comment = typeof params.comment === 'string' ? params.comment : '';
            // Recorded as the signed-in user — whatever name the client may have sent is dropped.
            payload.payload =
              event === 'approvalDecide'
                ? { pipelineIdentifier: auth.item.pipelineIdentifier, approved, comment, decidedBy: currentUser.email }
                : {
                    appIdentifier: params.appIdentifier,
                    pipelineIdentifier: auth.item.pipelineIdentifier,
                    approved,
                    comment,
                    actor: currentUser.email,
                  };
            if (payload.correlationId) {
              this.pendingDecisions.set(payload.correlationId, {
                user: currentUser,
                ip,
                item: auth.item,
                approved,
                comment,
                appIdentifier: event === 'appApprovalDecide' ? (params.appIdentifier ?? null) : null,
              });
            }
          }

          if (event === 'pipelineCancel') {
            const auth = await authorizeCancel(payload.payload, currentUser, {
              getRun: (pipelineIdentifier) => this.coreClient.request('pipelineDetail', { pipelineIdentifier }),
              getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
              ownsRequest: (correlationId) => this.correlationMap.get(correlationId) === ws,
            });
            if (!auth.allowed) {
              if (payload.correlationId) this.correlationMap.delete(payload.correlationId);
              ws.send(JSON.stringify({ event: 'onPipelineCancel', correlationId: payload.correlationId, error: auth.error }));
              return;
            }
            // Recorded as the signed-in user — whatever name the client may have sent is dropped.
            payload.payload = { ...auth.target, canceledBy: currentUser.email };
            await AuditLogService.log({
              actorId: currentUser.id,
              actorEmail: currentUser.email,
              action: 'run.cancel',
              targetType: 'pipeline',
              targetId: 'pipelineIdentifier' in auth.target ? auth.target.pipelineIdentifier : null,
              metadata: { workflow: auth.taskIdentifier },
              ip,
            });
          }

          if (event === 'exec') {
            const taskId = payload.payload?.identifier;
            const cid = payload.correlationId;
            if (taskId && cid) {
              this.pendingTriggers.set(cid, {
                type: 'user',
                ref: currentUser.id,
                name: currentUser.email,
                taskIdentifier: taskId,
                requestedBy: { id: currentUser.id, email: currentUser.email },
              });
            }
          }

          this.coreClient.send(event, payload);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.clientUser.delete(ws);
        for (const [cid, client] of this.correlationMap) {
          if (client === ws) this.correlationMap.delete(cid);
        }
        console.log(`[WsGateway] Client disconnected (${this.clients.size} remaining)`);
      });

      ws.on('error', (err) => {
        console.error('[WsGateway] Client error:', err.message);
        this.clients.delete(ws);
        this.clientUser.delete(ws);
      });
    });

    for (const event of ALL_CORE_EVENTS) {
      this.coreClient.on(event, (data: any) => this.route(event, data));
    }
  }

  private route(event: string, data: any): void {
    // Fire-and-forget async side-effects; routing uses the original data synchronously
    void this.handleCoreEventSideEffects(event, data);

    if (event === 'onTaskList' || event === 'onTaskUsage') {
      void this.routeTaskListFiltered(event, data);
      return;
    }
    if (event === 'onProjectMap' || event === 'onProjectDetail') {
      void this.routeProjectFiltered(event, data);
      return;
    }
    if (APPROVAL_LISTS.has(event)) {
      void this.routeApprovalsFiltered(event, data);
      return;
    }
    if (event === 'onAppRunsActive') {
      this.routeOwnAppRuns(event, data);
      return;
    }
    if (SECRET_BEARING_ANSWERS.has(event)) {
      this.routeHidingSecrets(event, data);
      return;
    }

    const msg = JSON.stringify({ event, ...data });
    const correlationId = data?.correlationId;

    if (correlationId) {
      const ws = this.correlationMap.get(correlationId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(msg);
      } else if (!ws) {
        this.broadcast(msg);
      }
      if (!STREAM_EVENTS.has(event)) {
        this.correlationMap.delete(correlationId);
      }
    } else {
      this.broadcast(msg);
    }
  }

  /**
   * Answers that can hold a secret go to whoever asked and nobody else, with what their role
   * may not see taken out. Editors keep variable values and workflow sources: they edit them,
   * and a workflow they write can read them anyway.
   */
  private routeHidingSecrets(event: string, data: any): void {
    const correlationId = data?.correlationId;
    const ws = correlationId ? this.correlationMap.get(correlationId) : undefined;
    const user = ws ? this.clientUser.get(ws) : undefined;
    if (correlationId) this.correlationMap.delete(correlationId);
    if (!ws || !user || ws.readyState !== WebSocket.OPEN) return;

    let answer = data?.data;
    if (answer && user.role !== 'admin' && event === 'onSettingsList') {
      answer = withoutCredentialSettings(answer);
    }
    if (answer && user.role === 'viewer') {
      if (event === 'onVariableList' && Array.isArray(answer)) answer = withoutSecretValues(answer);
      if ((event === 'onTaskDetail' || event === 'onTaskRevisionDetail') && answer.source) {
        answer = { ...answer, source: withoutWrittenInSecrets(answer.source) };
      }
    }
    ws.send(JSON.stringify({ event, ...data, data: answer }));
  }

  /**
   * Active app runs, only those this connection started: a run's events go only to
   * the connection that started it, so a run of another client (another user, or
   * another desktop) could never be followed — it would just look stuck.
   */
  private routeOwnAppRuns(event: string, data: any): void {
    const correlationId = data?.correlationId;
    const ws = correlationId ? this.correlationMap.get(correlationId) : undefined;
    if (correlationId) this.correlationMap.delete(correlationId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const runs = Array.isArray(data?.data)
      ? data.data.filter((r: any) => this.correlationMap.get(r?.correlationId) === ws)
      : data?.data;
    ws.send(JSON.stringify({ event, ...data, data: runs }));
  }

  private async routeTaskListFiltered(event: string, data: any): Promise<void> {
    const correlationId = data?.correlationId;
    let outData = data;

    // A task list, or a usage report's list of calling workflows.
    const tasks = event === 'onTaskUsage' ? data?.data?.workflows : data?.data;
    if (correlationId && Array.isArray(tasks)) {
      const ws = this.correlationMap.get(correlationId);
      const user = ws ? this.clientUser.get(ws) : undefined;
      if (user && user.role !== 'admin') {
        const hidden = await TaskOwnershipService.privateOwnedByOthers(user.id);
        if (hidden.size > 0) {
          const visible = tasks.filter((t: any) => !hidden.has(t.identifier));
          outData = {
            ...data,
            data: event === 'onTaskUsage' ? { ...data.data, workflows: visible } : visible,
          };
        }
      }
    }

    const msg = JSON.stringify({ event, ...outData });
    if (correlationId) {
      const ws = this.correlationMap.get(correlationId);
      if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
      this.correlationMap.delete(correlationId);
    } else {
      this.broadcast(msg);
    }
  }

  /**
   * A project's detail or map, without other users' private workflows: being in a shared
   * project doesn't let anyone see one. On the map it stays as a locked card. Goes only to
   * the asker; without a known asker nothing is sent.
   */
  private async routeProjectFiltered(event: string, data: any): Promise<void> {
    const correlationId = data?.correlationId;
    const ws = correlationId ? this.correlationMap.get(correlationId) : undefined;
    if (correlationId) this.correlationMap.delete(correlationId);
    const user = ws ? this.clientUser.get(ws) : undefined;
    if (!ws || !user || ws.readyState !== WebSocket.OPEN) return;

    let answer = data?.data;
    if (answer && user.role !== 'admin') {
      const hidden = await TaskOwnershipService.privateOwnedByOthers(user.id);
      answer = event === 'onProjectMap' ? hideInProjectMap(answer, hidden) : hideInProjectDetail(answer, hidden);
    }
    ws.send(JSON.stringify({ event, ...data, data: answer }));
  }

  /** Approval lists go only to the asker, without runs they may not see, each marked with
   *  whether they may decide it. Without a known asker nothing is sent. */
  private async routeApprovalsFiltered(event: string, data: any): Promise<void> {
    const correlationId = data?.correlationId;
    const ws = correlationId ? this.correlationMap.get(correlationId) : undefined;
    if (correlationId) this.correlationMap.delete(correlationId);
    const user = ws ? this.clientUser.get(ws) : undefined;
    if (!ws || !user || ws.readyState !== WebSocket.OPEN) return;

    let outData = data;
    if (Array.isArray(data?.data) && event === 'onApprovalHistory') {
      const items = await visibleHistory(data.data, user, {
        getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
      });
      outData = { ...data, data: items };
    } else if (Array.isArray(data?.data)) {
      const items = await visibleApprovals(data.data, user, {
        getOwner: (taskIdentifier) => TaskOwnershipService.getOwner(taskIdentifier),
        getRequester: (pipelineIdentifier) => PipelineAuditService.getRequester(pipelineIdentifier),
      });
      outData = { ...data, data: items };
    }
    ws.send(JSON.stringify({ event, ...outData }));
  }

  private async handleCoreEventSideEffects(event: string, data: any): Promise<void> {
    const correlationId = data?.correlationId;

    if ((event === 'onApprovalDecide' || event === 'onAppApprovalDecide') && correlationId) {
      const decision = this.pendingDecisions.get(correlationId);
      this.pendingDecisions.delete(correlationId);
      if (decision && !data?.error) {
        await AuditLogService.log({
          actorId: decision.user.id,
          actorEmail: decision.user.email,
          action: decision.approved ? 'approval.approve' : 'approval.reject',
          targetType: 'pipeline',
          targetId: decision.item.pipelineIdentifier,
          metadata: {
            title: decision.item.title ?? null,
            workflow: decision.item.taskIdentifier,
            comment: decision.comment,
            ...(decision.appIdentifier ? { app: decision.appIdentifier } : {}),
          },
          ip: decision.ip,
        });
      }
    }

    if (event === 'onTaskNew' || event === 'onTaskInstall') {
      const taskId = data?.data?.identifier;
      if (taskId && !data.error && correlationId) {
        const ws = this.correlationMap.get(correlationId);
        const user = ws ? this.clientUser.get(ws) : undefined;
        if (user) await TaskOwnershipService.claim(taskId, user.id);
      }
    }

    // A deleted workflow keeps its owner while it's in the Trash, so a restore gives it
    // back to them. Deleting it for good drops the owner. (Items the Trash purges after
    // 30 days leave an owner row behind for an identifier that's never used again.)
    if ((event === 'onTrashDelete' || event === 'onTrashEmpty') && !data.error) {
      for (const item of data?.data?.removed ?? []) {
        if (item?.kind === 'task' && item.identifier) await TaskOwnershipService.remove(item.identifier);
      }
    }

    if (event === 'onTaskStart' && correlationId) {
      const pending = this.pendingTriggers.get(correlationId);
      if (pending) {
        await PipelineAuditService.start(
          correlationId,
          pending.taskIdentifier,
          pending.type,
          pending.ref,
          pending.name,
          pending.requestedBy ?? null
        );
        this.pendingTriggers.delete(correlationId);
      }
      const pipelineId = data?.pipelineIdentifier ?? data?.data?.pipelineIdentifier;
      if (pipelineId) await PipelineAuditService.attachPipelineId(correlationId, pipelineId);
    }

    if (event === 'onTaskEnd' && correlationId) {
      await PipelineAuditService.complete(correlationId, 'completed');
    }
    if (event === 'onTaskError' && correlationId) {
      await PipelineAuditService.complete(correlationId, 'error');
    }
  }

  private broadcast(msg: string): void {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return null;
  }
}

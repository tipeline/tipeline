import { ipcMain, BrowserWindow } from 'electron';
import { closeDetachedWindows } from './DetachedWindows';
import { generateIdentifier } from '@tipeline/utils';
import fs from 'node:fs';
import path from 'node:path';
import { WsClient } from './utils/WsClient';
import { CoreService } from './utils/CoreService';
import { CoreClientProxy } from './utils/CoreClientProxy';
import { SEND, CORE, CORE_RESP } from './utils/ipc-channels';

/**
 * Two operation types with two different Electron IPC patterns:
 *
 * QUERY ops  — single request → single response
 *   Renderer: ipcRenderer.invoke()  →  Main: ipcMain.handle()
 *   Main awaits CoreService.request() which holds the Promise until core replies.
 *
 * STREAM ops — single request → multiple push events
 *   Renderer: ipcRenderer.send()   →  Main: ipcMain.on()
 *   Core pushes back onTaskStart/onAction/onTaskEnd; main forwards each on
 *   a correlationId-namespaced channel so only the originating component hears it.
 */

const QUERY_OPS: Array<{ send: string; core: string; coreResp: string; timeoutMs?: number }> = [
  { send: SEND.TASK_LIST, core: CORE.TASK_LIST, coreResp: CORE_RESP.TASK_LIST },
  { send: SEND.TASK_DETAIL, core: CORE.TASK_DETAIL, coreResp: CORE_RESP.TASK_DETAIL },
  { send: SEND.TASK_NEW, core: CORE.TASK_NEW, coreResp: CORE_RESP.TASK_NEW },
  { send: SEND.TASK_DUPLICATE, core: CORE.TASK_DUPLICATE, coreResp: CORE_RESP.TASK_DUPLICATE },
  { send: SEND.TASK_USAGE, core: CORE.TASK_USAGE, coreResp: CORE_RESP.TASK_USAGE },
  { send: SEND.TASK_REVISION_LIST, core: CORE.TASK_REVISION_LIST, coreResp: CORE_RESP.TASK_REVISION_LIST },
  { send: SEND.TASK_REVISION_DETAIL, core: CORE.TASK_REVISION_DETAIL, coreResp: CORE_RESP.TASK_REVISION_DETAIL },
  { send: SEND.TASK_REVISION_RESTORE, core: CORE.TASK_REVISION_RESTORE, coreResp: CORE_RESP.TASK_REVISION_RESTORE },
  { send: SEND.TASK_CAPABILITIES, core: CORE.TASK_CAPABILITIES, coreResp: CORE_RESP.TASK_CAPABILITIES },
  { send: SEND.TASK_CAPABILITY_INDEX, core: CORE.TASK_CAPABILITY_INDEX, coreResp: CORE_RESP.TASK_CAPABILITY_INDEX },
  { send: SEND.TASK_UPDATE_SOURCE, core: CORE.TASK_UPDATE_SOURCE, coreResp: CORE_RESP.TASK_UPDATE_SOURCE },
  { send: SEND.TASK_UPDATE_META, core: CORE.TASK_UPDATE_META, coreResp: CORE_RESP.TASK_UPDATE_META },
  { send: SEND.TASK_MARK_READY, core: CORE.TASK_MARK_READY, coreResp: CORE_RESP.TASK_MARK_READY },
  { send: SEND.TASK_VALIDATE, core: CORE.TASK_VALIDATE, coreResp: CORE_RESP.TASK_VALIDATE },
  { send: SEND.SCRIPT_PREVIEW, core: CORE.SCRIPT_PREVIEW, coreResp: CORE_RESP.SCRIPT_PREVIEW },
  { send: SEND.TASK_INSTALL, core: CORE.TASK_INSTALL, coreResp: CORE_RESP.TASK_INSTALL },
  { send: SEND.TASK_EXPORT_ALL, core: CORE.TASK_EXPORT_ALL, coreResp: CORE_RESP.TASK_EXPORT_ALL },
  { send: SEND.TASK_RELOAD, core: CORE.TASK_RELOAD, coreResp: CORE_RESP.TASK_RELOAD },
  { send: SEND.TASK_UNINSTALL, core: CORE.TASK_UNINSTALL, coreResp: CORE_RESP.TASK_UNINSTALL },
  { send: SEND.TASK_UPLOAD_IMAGE, core: CORE.TASK_UPLOAD_IMAGE, coreResp: CORE_RESP.TASK_UPLOAD_IMAGE },
  { send: SEND.PIPELINE_LIST, core: CORE.PIPELINE_LIST, coreResp: CORE_RESP.PIPELINE_LIST },
  { send: SEND.PIPELINE_DETAIL, core: CORE.PIPELINE_DETAIL, coreResp: CORE_RESP.PIPELINE_DETAIL },
  { send: SEND.PIPELINE_STATS, core: CORE.PIPELINE_STATS, coreResp: CORE_RESP.PIPELINE_STATS },
  { send: SEND.PIPELINE_CLEAR, core: CORE.PIPELINE_CLEAR, coreResp: CORE_RESP.PIPELINE_CLEAR },
  { send: SEND.PIPELINE_CLEAR_ALL, core: CORE.PIPELINE_CLEAR_ALL, coreResp: CORE_RESP.PIPELINE_CLEAR_ALL },
  { send: SEND.PIPELINE_DELETE, core: CORE.PIPELINE_DELETE, coreResp: CORE_RESP.PIPELINE_DELETE },
  { send: SEND.PIPELINE_CANCEL, core: CORE.PIPELINE_CANCEL, coreResp: CORE_RESP.PIPELINE_CANCEL },
  { send: SEND.APP_LIST, core: CORE.APP_LIST, coreResp: CORE_RESP.APP_LIST },
  { send: SEND.APP_DETAIL, core: CORE.APP_DETAIL, coreResp: CORE_RESP.APP_DETAIL },
  { send: SEND.APP_NEW, core: CORE.APP_NEW, coreResp: CORE_RESP.APP_NEW },
  { send: SEND.APP_UPDATE_SOURCE, core: CORE.APP_UPDATE_SOURCE, coreResp: CORE_RESP.APP_UPDATE_SOURCE },
  { send: SEND.APP_UPDATE_META, core: CORE.APP_UPDATE_META, coreResp: CORE_RESP.APP_UPDATE_META },
  { send: SEND.APP_UPLOAD_IMAGE, core: CORE.APP_UPLOAD_IMAGE, coreResp: CORE_RESP.APP_UPLOAD_IMAGE },
  { send: SEND.APP_INSTALL, core: CORE.APP_INSTALL, coreResp: CORE_RESP.APP_INSTALL },
  { send: SEND.APP_EXPORT, core: CORE.APP_EXPORT, coreResp: CORE_RESP.APP_EXPORT },
  { send: SEND.APP_UNINSTALL, core: CORE.APP_UNINSTALL, coreResp: CORE_RESP.APP_UNINSTALL },
  { send: SEND.TABLE_DATA_FETCH, core: CORE.TABLE_DATA_FETCH, coreResp: CORE_RESP.TABLE_DATA_FETCH },
  { send: SEND.APP_HISTORY_FETCH, core: CORE.APP_HISTORY_FETCH, coreResp: CORE_RESP.APP_HISTORY_FETCH },
  { send: SEND.APPROVAL_LIST, core: CORE.APPROVAL_LIST, coreResp: CORE_RESP.APPROVAL_LIST },
  { send: SEND.APPROVAL_DECIDE, core: CORE.APPROVAL_DECIDE, coreResp: CORE_RESP.APPROVAL_DECIDE },
  { send: SEND.APPROVAL_HISTORY, core: CORE.APPROVAL_HISTORY, coreResp: CORE_RESP.APPROVAL_HISTORY },
  { send: SEND.APP_APPROVAL_LIST, core: CORE.APP_APPROVAL_LIST, coreResp: CORE_RESP.APP_APPROVAL_LIST },
  { send: SEND.APP_APPROVAL_DECIDE, core: CORE.APP_APPROVAL_DECIDE, coreResp: CORE_RESP.APP_APPROVAL_DECIDE },
  { send: SEND.APP_RUNS_ACTIVE, core: CORE.APP_RUNS_ACTIVE, coreResp: CORE_RESP.APP_RUNS_ACTIVE },
  { send: SEND.APP_RUNS_LIST, core: CORE.APP_RUNS_LIST, coreResp: CORE_RESP.APP_RUNS_LIST },
  { send: SEND.VARIABLE_LIST, core: CORE.VARIABLE_LIST, coreResp: CORE_RESP.VARIABLE_LIST },
  { send: SEND.VARIABLE_NEW, core: CORE.VARIABLE_NEW, coreResp: CORE_RESP.VARIABLE_NEW },
  { send: SEND.VARIABLE_EDIT, core: CORE.VARIABLE_EDIT, coreResp: CORE_RESP.VARIABLE_EDIT },
  { send: SEND.VARIABLE_DUPLICATE, core: CORE.VARIABLE_DUPLICATE, coreResp: CORE_RESP.VARIABLE_DUPLICATE },
  { send: SEND.VARIABLE_DELETE, core: CORE.VARIABLE_DELETE, coreResp: CORE_RESP.VARIABLE_DELETE },
  { send: SEND.VARIABLE_USAGE, core: CORE.VARIABLE_USAGE, coreResp: CORE_RESP.VARIABLE_USAGE },
  { send: SEND.VARIABLE_EXPORT_ALL, core: CORE.VARIABLE_EXPORT_ALL, coreResp: CORE_RESP.VARIABLE_EXPORT_ALL },
  // Zipping or restoring everything can outlast the default 15s; a timeout here would
  // report a failure while the backup or restore is still running.
  { send: SEND.TRASH_LIST, core: CORE.TRASH_LIST, coreResp: CORE_RESP.TRASH_LIST },
  { send: SEND.TRASH_RESTORE, core: CORE.TRASH_RESTORE, coreResp: CORE_RESP.TRASH_RESTORE },
  { send: SEND.TRASH_DELETE, core: CORE.TRASH_DELETE, coreResp: CORE_RESP.TRASH_DELETE },
  { send: SEND.TRASH_EMPTY, core: CORE.TRASH_EMPTY, coreResp: CORE_RESP.TRASH_EMPTY },
  { send: SEND.FULL_BACKUP, core: CORE.FULL_BACKUP, coreResp: CORE_RESP.FULL_BACKUP, timeoutMs: 120_000 },
  { send: SEND.FULL_RESTORE, core: CORE.FULL_RESTORE, coreResp: CORE_RESP.FULL_RESTORE, timeoutMs: 120_000 },
  { send: SEND.BACKUP_CAPABILITIES, core: CORE.BACKUP_CAPABILITIES, coreResp: CORE_RESP.BACKUP_CAPABILITIES, timeoutMs: 60_000 },
  { send: SEND.TAG_LIST, core: CORE.TAG_LIST, coreResp: CORE_RESP.TAG_LIST },
  { send: SEND.TAG_NEW, core: CORE.TAG_NEW, coreResp: CORE_RESP.TAG_NEW },
  { send: SEND.TAG_RENAME, core: CORE.TAG_RENAME, coreResp: CORE_RESP.TAG_RENAME },
  { send: SEND.TAG_DELETE, core: CORE.TAG_DELETE, coreResp: CORE_RESP.TAG_DELETE },
  { send: SEND.SCHEDULE_LIST, core: CORE.SCHEDULE_LIST, coreResp: CORE_RESP.SCHEDULE_LIST },
  { send: SEND.SCHEDULE_SET, core: CORE.SCHEDULE_SET, coreResp: CORE_RESP.SCHEDULE_SET },
  { send: SEND.SCHEDULE_REMOVE, core: CORE.SCHEDULE_REMOVE, coreResp: CORE_RESP.SCHEDULE_REMOVE },
  { send: SEND.SCHEDULE_TOGGLE, core: CORE.SCHEDULE_TOGGLE, coreResp: CORE_RESP.SCHEDULE_TOGGLE },
  { send: SEND.STATUS, core: CORE.STATUS, coreResp: CORE_RESP.STATUS },
  { send: SEND.STOP, core: CORE.STOP, coreResp: CORE_RESP.STOP },
  { send: SEND.SETTINGS_LIST, core: CORE.SETTINGS_LIST, coreResp: CORE_RESP.SETTINGS_LIST },
  { send: SEND.SETTINGS_SET, core: CORE.SETTINGS_SET, coreResp: CORE_RESP.SETTINGS_SET },
  { send: SEND.SETTINGS_GET_API_TOKEN, core: CORE.SETTINGS_GET_API_TOKEN, coreResp: CORE_RESP.SETTINGS_GET_API_TOKEN },
  { send: SEND.CACHE_LIST, core: CORE.CACHE_LIST, coreResp: CORE_RESP.CACHE_LIST },
  { send: SEND.CACHE_CLEAR, core: CORE.CACHE_CLEAR, coreResp: CORE_RESP.CACHE_CLEAR },
  { send: SEND.PLUGIN_LIST, core: CORE.PLUGIN_LIST, coreResp: CORE_RESP.PLUGIN_LIST },
  { send: SEND.PLUGIN_SCAN, core: CORE.PLUGIN_SCAN, coreResp: CORE_RESP.PLUGIN_SCAN },
  { send: SEND.PLUGIN_DETAIL, core: CORE.PLUGIN_DETAIL, coreResp: CORE_RESP.PLUGIN_DETAIL },
  { send: SEND.PLUGIN_SET_ENABLED, core: CORE.PLUGIN_SET_ENABLED, coreResp: CORE_RESP.PLUGIN_SET_ENABLED },
  { send: SEND.PLUGIN_REMOVE, core: CORE.PLUGIN_REMOVE, coreResp: CORE_RESP.PLUGIN_REMOVE },
  { send: SEND.PLUGIN_USAGE, core: CORE.PLUGIN_USAGE, coreResp: CORE_RESP.PLUGIN_USAGE },
  { send: SEND.PROJECT_LIST, core: CORE.PROJECT_LIST, coreResp: CORE_RESP.PROJECT_LIST },
  { send: SEND.PROJECT_NEW, core: CORE.PROJECT_NEW, coreResp: CORE_RESP.PROJECT_NEW },
  { send: SEND.PROJECT_DETAIL, core: CORE.PROJECT_DETAIL, coreResp: CORE_RESP.PROJECT_DETAIL },
  { send: SEND.PROJECT_UPDATE, core: CORE.PROJECT_UPDATE, coreResp: CORE_RESP.PROJECT_UPDATE },
  { send: SEND.PROJECT_DELETE, core: CORE.PROJECT_DELETE, coreResp: CORE_RESP.PROJECT_DELETE },
  { send: SEND.PROJECT_DELETE_PREVIEW, core: CORE.PROJECT_DELETE_PREVIEW, coreResp: CORE_RESP.PROJECT_DELETE_PREVIEW },
  { send: SEND.PROJECT_ASSIGN_TASK, core: CORE.PROJECT_ASSIGN_TASK, coreResp: CORE_RESP.PROJECT_ASSIGN_TASK },
  { send: SEND.PROJECT_UNASSIGN_TASK, core: CORE.PROJECT_UNASSIGN_TASK, coreResp: CORE_RESP.PROJECT_UNASSIGN_TASK },
  { send: SEND.PROJECT_ASSIGN_APP, core: CORE.PROJECT_ASSIGN_APP, coreResp: CORE_RESP.PROJECT_ASSIGN_APP },
  { send: SEND.PROJECT_UNASSIGN_APP, core: CORE.PROJECT_UNASSIGN_APP, coreResp: CORE_RESP.PROJECT_UNASSIGN_APP },
  { send: SEND.PROJECT_EXPORT, core: CORE.PROJECT_EXPORT, coreResp: CORE_RESP.PROJECT_EXPORT, timeoutMs: 120_000 },
  { send: SEND.PROJECT_IMPORT, core: CORE.PROJECT_IMPORT, coreResp: CORE_RESP.PROJECT_IMPORT, timeoutMs: 120_000 },
  { send: SEND.PROJECT_MAP, core: CORE.PROJECT_MAP, coreResp: CORE_RESP.PROJECT_MAP },
  { send: SEND.PROJECT_MAP_SAVE, core: CORE.PROJECT_MAP_SAVE, coreResp: CORE_RESP.PROJECT_MAP_SAVE },
  { send: SEND.PROJECT_MAP_LINK, core: CORE.PROJECT_MAP_LINK, coreResp: CORE_RESP.PROJECT_MAP_LINK },
  { send: SEND.AGENT_RUN_LIST, core: CORE.AGENT_RUN_LIST, coreResp: CORE_RESP.AGENT_RUN_LIST },
  { send: SEND.ASSISTANT_FINDABILITY, core: CORE.ASSISTANT_FINDABILITY, coreResp: CORE_RESP.ASSISTANT_FINDABILITY },
  { send: SEND.AGENT_RUN_SET_PIPELINE, core: CORE.AGENT_RUN_SET_PIPELINE, coreResp: CORE_RESP.AGENT_RUN_SET_PIPELINE },
  { send: SEND.HUB_LIST, core: CORE.HUB_LIST, coreResp: CORE_RESP.HUB_LIST },
  { send: SEND.HUB_ADD, core: CORE.HUB_ADD, coreResp: CORE_RESP.HUB_ADD },
  { send: SEND.HUB_REMOVE, core: CORE.HUB_REMOVE, coreResp: CORE_RESP.HUB_REMOVE },
  { send: SEND.HUB_UPDATE, core: CORE.HUB_UPDATE, coreResp: CORE_RESP.HUB_UPDATE },
  { send: SEND.HUB_SET_ENABLED, core: CORE.HUB_SET_ENABLED, coreResp: CORE_RESP.HUB_SET_ENABLED },
  { send: SEND.HUB_CATALOG, core: CORE.HUB_CATALOG, coreResp: CORE_RESP.HUB_CATALOG },
  { send: SEND.HUB_INSTALL_TASK, core: CORE.HUB_INSTALL_TASK, coreResp: CORE_RESP.HUB_INSTALL_TASK },
  { send: SEND.HUB_PREVIEW_TASK, core: CORE.HUB_PREVIEW_TASK, coreResp: CORE_RESP.HUB_PREVIEW_TASK },
  { send: SEND.HUB_INSTALL_APP, core: CORE.HUB_INSTALL_APP, coreResp: CORE_RESP.HUB_INSTALL_APP },
  // Plugin install/update runs `npm install`, which can legitimately take well
  // over the default 15s timeout (cold cache, slow registry) — the generic
  // timeout would fire and silently orphan an install that's still running
  // fine on the Core side, with the failure never surfacing anywhere.
  { send: SEND.HUB_INSTALL_PLUGIN, core: CORE.HUB_INSTALL_PLUGIN, coreResp: CORE_RESP.HUB_INSTALL_PLUGIN, timeoutMs: 120_000 },
  { send: SEND.HUB_UPDATE_TASK, core: CORE.HUB_UPDATE_TASK, coreResp: CORE_RESP.HUB_UPDATE_TASK },
  { send: SEND.HUB_UPDATE_APP, core: CORE.HUB_UPDATE_APP, coreResp: CORE_RESP.HUB_UPDATE_APP },
  { send: SEND.HUB_UPDATE_PLUGIN, core: CORE.HUB_UPDATE_PLUGIN, coreResp: CORE_RESP.HUB_UPDATE_PLUGIN, timeoutMs: 120_000 },
  { send: SEND.HUB_PREVIEW_UPDATE, core: CORE.HUB_PREVIEW_UPDATE, coreResp: CORE_RESP.HUB_PREVIEW_UPDATE },
  { send: SEND.HUB_UPDATE_EVENTS, core: CORE.HUB_UPDATE_EVENTS, coreResp: CORE_RESP.HUB_UPDATE_EVENTS },
  { send: SEND.HUB_UPDATE_EVENTS_READ, core: CORE.HUB_UPDATE_EVENTS_READ, coreResp: CORE_RESP.HUB_UPDATE_EVENTS_READ },
  { send: SEND.HUB_CHECK_ALL, core: CORE.HUB_CHECK_ALL, coreResp: CORE_RESP.HUB_CHECK_ALL, timeoutMs: 120_000 },
  { send: SEND.HUB_CHECK_ONE, core: CORE.HUB_CHECK_ONE, coreResp: CORE_RESP.HUB_CHECK_ONE, timeoutMs: 120_000 },
  { send: SEND.HUB_SET_TASK_AUTO_UPDATE, core: CORE.HUB_SET_TASK_AUTO_UPDATE, coreResp: CORE_RESP.HUB_SET_TASK_AUTO_UPDATE },
  { send: SEND.HUB_SET_APP_AUTO_UPDATE, core: CORE.HUB_SET_APP_AUTO_UPDATE, coreResp: CORE_RESP.HUB_SET_APP_AUTO_UPDATE },
  { send: SEND.HUB_SET_PLUGIN_AUTO_UPDATE, core: CORE.HUB_SET_PLUGIN_AUTO_UPDATE, coreResp: CORE_RESP.HUB_SET_PLUGIN_AUTO_UPDATE },
];

const QUERY_RESPONSES: string[] = QUERY_OPS.map((op) => op.coreResp);

// Connection response events — always settle via localRequest (IpcClient), not CoreClientProxy
const CONNECTION_RESPONSES: string[] = [
  CORE_RESP.CONNECTION_LIST,
  CORE_RESP.CONNECTION_ADD,
  CORE_RESP.CONNECTION_REMOVE,
  CORE_RESP.CONNECTION_UPDATE,
  CORE_RESP.CONNECTION_SET_ACTIVE,
  CORE_RESP.CONNECTION_GET_ACTIVE,
];

// Agent run write events — only ever called from main (AgentService) via CoreService.localRequest,
// never exposed as a renderer-facing SEND channel, but still need their responses settled.
const AGENT_WRITE_RESPONSES: string[] = [
  CORE_RESP.AGENT_RUN_CREATE,
  CORE_RESP.AGENT_RUN_MARK_PROPOSED,
  CORE_RESP.AGENT_RUN_MARK_TASK_RUNNING,
  CORE_RESP.AGENT_RUN_COMPLETE,
  CORE_RESP.AGENT_RUN_FAIL,
];

const STREAM_OPS: Array<{ send: string; core: string }> = [
  { send: SEND.TASK_EXEC, core: CORE.EXEC },
  { send: SEND.APP_RUN, core: CORE.APP_RUN },
  { send: SEND.PIPELINE_RESUME, core: CORE.PIPELINE_RESUME },
  { send: SEND.DEBUG_NEXT, core: CORE.DEBUG_NEXT },
  { send: SEND.DEBUG_RUN, core: CORE.DEBUG_RUN },
  { send: SEND.DEBUG_PAUSE, core: CORE.DEBUG_PAUSE },
  { send: SEND.DEBUG_STOP, core: CORE.DEBUG_STOP },
  { send: SEND.DEBUG_COMMAND, core: CORE.DEBUG_COMMAND },
];

const STREAM_RESPONSES: Array<{ resp: string; type: string }> = [
  { resp: CORE_RESP.TASK_START, type: 'start' },
  { resp: CORE_RESP.ACTION, type: 'action' },
  { resp: CORE_RESP.ACTION_ERROR, type: 'action_error' },
  { resp: CORE_RESP.TASK_END, type: 'end' },
  { resp: CORE_RESP.TASK_ERROR, type: 'error' },
  { resp: CORE_RESP.TASK_END_ALL, type: 'end_all' },
  { resp: CORE_RESP.DEBUG_PAUSED, type: 'paused' },
];

export class MessageManager {
  private readonly window: BrowserWindow;
  // Set when remote workspace is unreachable at startup so the renderer
  // sees local as the effective active workspace without touching the DB.
  private localFallback = false;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  async init() {
    const handlers = this.buildCoreHandlers();

    // Register renderer-facing handlers immediately so they are available before Core connects.
    // CoreService.request queues messages; they are flushed once the Core IPC connection is up.
    this.registerRendererHandlers();

    // Connect to local Core (blocks until Core process is up and IPC socket connects)
    await CoreClientProxy.switchToLocal(handlers, () => this.send('core:disconnected', {}), () => this.send('core:reconnected', {}));

    const active = await CoreService.localRequest<{ activeId: string | null; connection: any }>(
      CORE.CONNECTION_GET_ACTIVE,
      { correlationId: generateIdentifier() }
    );

    if (active.connection) {
      const wsClient = new WsClient(active.connection.host, active.connection.token);
      try {
        await CoreClientProxy.switchToRemote(wsClient, handlers, () => this.send('core:disconnected', {}), () => this.send('core:reconnected', {}));
      } catch (err: any) {
        wsClient.disconnect(); // stop the reconnect loop
        console.warn('[MessageManager] Remote workspace unreachable, using local:', err?.message ?? err);
        // switchToRemote threw before swapping active, so local IPC is still active.
        // Flag overrides CONNECTION_GET_ACTIVE so the renderer shows local as active.
        this.localFallback = true;
        this.send('workspace-unavailable', { id: active.activeId });
      }
    }

    this.registerServerHandlers();
    this.registerConnectionHandlers(handlers);
  }

  // ---------------------------------------------------------------------------
  // Core → Main → Renderer
  // ---------------------------------------------------------------------------

  private buildCoreHandlers(): Record<string, (response: any) => void> {
    const handlers: Record<string, (response: any) => void> = {};

    for (const coreEvent of [...QUERY_RESPONSES, ...CONNECTION_RESPONSES, ...AGENT_WRITE_RESPONSES]) {
      handlers[coreEvent] = (response: any) => {
        CoreService.settle(response.correlationId, response.data, response.error);
      };
    }

    for (const { resp, type } of STREAM_RESPONSES) {
      handlers[resp] = (response: any) => {
        console.log(`[MessageManager] core event: ${resp}, correlationId: ${response?.correlationId}`);
        const msg = { type, ...response };
        this.send(`stream:${response.correlationId}`, msg);
        this.send('stream:broadcast', msg);
      };
    }

    return handlers;
  }

  // ---------------------------------------------------------------------------
  // Renderer → Main → Core
  // ---------------------------------------------------------------------------

  private registerRendererHandlers() {
    for (const { send, core, timeoutMs } of QUERY_OPS) {
      ipcMain.handle(send, (_, payload) => CoreService.request(core, payload, timeoutMs));
    }

    ipcMain.removeHandler(SEND.TASK_INSTALL);
    ipcMain.handle(SEND.TASK_INSTALL, async (_, { correlationId, payload: filePath }) => {
      let content: string;
      try {
        content = fs.readFileSync(filePath as string, 'utf8');
      } catch {
        throw new Error('Could not read the selected file. It may have been moved or deleted.');
      }
      return CoreService.request(CORE.TASK_INSTALL, {
        correlationId,
        payload: { content, baseDir: path.dirname(path.resolve(filePath as string)) },
      });
    });

    for (const { send, core } of STREAM_OPS) {
      ipcMain.on(send, (_, payload) => CoreClientProxy.send(core, payload));
    }
  }

  // ---------------------------------------------------------------------------
  // Connection / workspace management — always routed to local Core via IpcClient
  // ---------------------------------------------------------------------------

  private registerServerHandlers() {
    ipcMain.handle(SEND.SERVER_LOGIN, async (_, { host, email, password }: { host: string; email: string; password: string }) => {
      const httpUrl = wsToHttp(host);
      const res = await fetch(`${httpUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Login failed' }));
        throw new Error((err as any).error ?? 'Login failed');
      }
      return res.json() as Promise<{ token?: string; mfaRequired?: boolean; challengeId?: string }>;
    });

    ipcMain.handle(SEND.SERVER_LOGIN_MFA, async (_, { host, challengeId, code }: { host: string; challengeId: string; code: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/login/mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Login failed' }));
        throw new Error((err as any).error ?? 'Login failed');
      }
      const { token } = (await res.json()) as { token: string };
      return token;
    });

    ipcMain.handle(SEND.SERVER_ME, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_USERS_LIST, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_USER_CREATE, async (_, { host, token, email, name, password, role }: { host: string; token: string; email: string; name: string; password: string; role: string }) => {
      const res = await fetch(`${wsToHttp(host)}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, name, password, role }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_USER_UPDATE, async (_, { host, token, id, ...data }: { host: string; token: string; id: string; name?: string; role?: string; is_active?: number }) => {
      const res = await fetch(`${wsToHttp(host)}/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_USER_DEACTIVATE, async (_, { host, token, id }: { host: string; token: string; id: string }) => {
      const res = await fetch(`${wsToHttp(host)}/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_WEBHOOK_LIST, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/webhooks`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_WEBHOOK_CREATE, async (_, { host, token, ...data }: { host: string; token: string; name: string; task_identifier: string; method?: string; variables_mapping?: Record<string, string> | null }) => {
      const res = await fetch(`${wsToHttp(host)}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_WEBHOOK_UPDATE, async (_, { host, token, id, ...data }: { host: string; token: string; id: string; name?: string; task_identifier?: string; enabled?: number }) => {
      const res = await fetch(`${wsToHttp(host)}/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_WEBHOOK_DELETE, async (_, { host, token, id }: { host: string; token: string; id: string }) => {
      const res = await fetch(`${wsToHttp(host)}/webhooks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_WEBHOOK_ROTATE, async (_, { host, token, id }: { host: string; token: string; id: string }) => {
      const res = await fetch(`${wsToHttp(host)}/webhooks/${id}/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TOKEN_LIST, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/tokens`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TOKEN_CREATE, async (_, { host, token, ...data }: { host: string; token: string; name: string; scope?: string; expiresIn?: string | null }) => {
      const res = await fetch(`${wsToHttp(host)}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TOKEN_ROTATE, async (_, { host, token, id }: { host: string; token: string; id: string }) => {
      const res = await fetch(`${wsToHttp(host)}/tokens/${id}/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TOKEN_REVOKE, async (_, { host, token, id }: { host: string; token: string; id: string }) => {
      const res = await fetch(`${wsToHttp(host)}/tokens/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_MFA_STATUS, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/mfa/status`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_MFA_ENROLLMENT, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/mfa/enrollment`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_MFA_ENROLL, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/mfa/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_MFA_CONFIRM, async (_, { host, token, code }: { host: string; token: string; code: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/mfa/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_MFA_DISABLE, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/auth/mfa/disable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_AUDIT_LOG_LIST, async (_, { host, token, limit, offset, action }: { host: string; token: string; limit?: number; offset?: number; action?: string }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      if (offset !== undefined) params.set('offset', String(offset));
      if (action) params.set('action', action);
      const url = `${wsToHttp(host)}/audit-log${params.size > 0 ? `?${params}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TASK_OWNERSHIP_LIST, async (_, { host, token }: { host: string; token: string }) => {
      const res = await fetch(`${wsToHttp(host)}/tasks/ownership`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_TASK_VISIBILITY_UPDATE, async (_, { host, token, identifier, visibility }: { host: string; token: string; identifier: string; visibility: string }) => {
      const res = await fetch(`${wsToHttp(host)}/tasks/${encodeURIComponent(identifier)}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });

    ipcMain.handle(SEND.SERVER_PIPELINE_AUDIT_LIST, async (_, { host, token, limit, offset }: { host: string; token: string; limit?: number; offset?: number }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      if (offset !== undefined) params.set('offset', String(offset));
      const url = `${wsToHttp(host)}/pipeline-audit${params.size > 0 ? `?${params}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Request failed');
      return res.json();
    });
  }

  private registerConnectionHandlers(handlers: Record<string, (response: any) => void>) {
    ipcMain.handle(SEND.CONNECTION_LIST, () =>
      CoreService.localRequest(CORE.CONNECTION_LIST, { correlationId: generateIdentifier() })
    );

    ipcMain.handle(SEND.CONNECTION_GET_ACTIVE, () => {
      if (this.localFallback) return { activeId: null, connection: null };
      return CoreService.localRequest(CORE.CONNECTION_GET_ACTIVE, { correlationId: generateIdentifier() });
    });

    ipcMain.handle(SEND.CONNECTION_ADD, (_, { payload: { name, host, token } }) =>
      CoreService.localRequest(CORE.CONNECTION_ADD, {
        correlationId: generateIdentifier(),
        payload: { name, host, token },
      })
    );

    ipcMain.handle(SEND.CONNECTION_UPDATE, async (_, { payload: { id, name, host, token } }) =>
      CoreService.localRequest(CORE.CONNECTION_UPDATE, {
        correlationId: generateIdentifier(),
        payload: { id, name, host, token },
      })
    );

    ipcMain.handle(SEND.CONNECTION_REMOVE, async (_, { payload: { id } }) => {
      const result = await CoreService.localRequest(CORE.CONNECTION_REMOVE, {
        correlationId: generateIdentifier(),
        payload: { id },
      });
      // If we just removed the active connection, fall back to local
      const active = await CoreService.localRequest<{ activeId: string | null }>(
        CORE.CONNECTION_GET_ACTIVE,
        { correlationId: generateIdentifier() }
      );
      if (!active.activeId) {
        await CoreClientProxy.switchToLocal(handlers);
        this.send('workspace-changed', { activeId: null, closedWindows: closeDetachedWindows() });
      }
      return result;
    });

    ipcMain.handle(SEND.CONNECTION_SET_ACTIVE, async (_, { payload: { id } }) => {
      await CoreService.localRequest(CORE.CONNECTION_SET_ACTIVE, {
        correlationId: generateIdentifier(),
        payload: { id },
      });

      this.localFallback = false; // user is explicitly switching — trust the DB again

      if (id === null) {
        await CoreClientProxy.switchToLocal(handlers);
      } else {
        const active = await CoreService.localRequest<{ activeId: string | null; connection: any }>(
          CORE.CONNECTION_GET_ACTIVE,
          { correlationId: generateIdentifier() }
        );
        if (!active.connection) throw new Error(`Connection not found: ${id}`);
        const wsClient = new WsClient(active.connection.host, active.connection.token);
        try {
          await CoreClientProxy.switchToRemote(wsClient, handlers, () => this.send('core:disconnected', {}), () => this.send('core:reconnected', {}));
        } catch {
          wsClient.disconnect();
          // Roll the DB preference back to local so the store stays consistent
          await CoreService.localRequest(CORE.CONNECTION_SET_ACTIVE, {
            correlationId: generateIdentifier(),
            payload: { id: null },
          });
          this.localFallback = true;
          throw new Error(`Cannot reach ${active.connection.host} — server may be offline`);
        }
      }

      this.send('workspace-changed', { activeId: id, closedWindows: closeDetachedWindows() });
    });
  }

  // Every window gets core's pushes: an app's run-only window starts its own runs and
  // must receive their stream events too. Stream channels are per correlationId, so
  // a window only reacts to the runs it started.
  private send(channel: string, data: any) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    }
  }
}

function wsToHttp(host: string): string {
  return host.replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
}

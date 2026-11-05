/**
 * Renderer-facing IPC channel constants.
 * Pass these to window.ipcRenderer.invoke() or window.ipcRenderer.send().
 *
 * Query channels  → use with ipcRenderer.invoke(SEND.X, payload)
 * Stream channels → use with ipcRenderer.send(SEND.X, payload);
 *                   listen on `stream:<correlationId>` for push events back
 *
 * Keep in sync with electron/main/utils/ipc-channels.ts.
 */
export const SEND = {
  // Tasks
  TASK_LIST: 'taskList',
  TASK_DETAIL: 'taskDetail',
  TASK_NEW: 'taskNew',
  TASK_DUPLICATE: 'taskDuplicate',
  TASK_USAGE: 'taskUsage',
  TASK_REVISION_LIST: 'taskRevisionList', // saved versions of a workflow
  TASK_REVISION_DETAIL: 'taskRevisionDetail',
  TASK_REVISION_RESTORE: 'taskRevisionRestore',
  TASK_CAPABILITIES: 'taskCapabilities',
  TASK_CAPABILITY_INDEX: 'taskCapabilityIndex',
  TASK_UPDATE_SOURCE: 'taskUpdateSource',
  TASK_UPDATE_META: 'taskUpdateMeta',
  TASK_MARK_READY: 'taskMarkReady',
  TASK_VALIDATE: 'taskValidate',
  SCRIPT_PREVIEW: 'scriptPreview', // run a script step's code for the editor's Output tab
  TASK_INSTALL: 'taskInstall',
  TASK_EXPORT_ALL: 'taskExportAll',
  TASK_RELOAD: 'taskReload',
  TASK_UNINSTALL: 'taskUninstall',
  TASK_UPLOAD_IMAGE: 'taskUploadImage',
  TASK_EXEC: 'taskExec',       // stream — run by identifier
  DEBUG_NEXT: 'debugNext',
  DEBUG_RUN: 'debugRun',
  DEBUG_PAUSE: 'debugPause',
  DEBUG_STOP: 'debugStop',
  DEBUG_COMMAND: 'debugCommand',
  // Pipelines
  PIPELINE_LIST: 'pipelineList',
  PIPELINE_DETAIL: 'pipelineDetail',
  PIPELINE_STATS: 'pipelineStats',
  PIPELINE_RESUME: 'pipelineResume', // stream
  PIPELINE_CLEAR: 'pipelineClear',
  PIPELINE_CLEAR_ALL: 'pipelineClearAll',
  PIPELINE_DELETE: 'pipelineDelete',
  PIPELINE_CANCEL: 'pipelineCancel',
  // Apps
  APP_LIST: 'appList',
  APP_DETAIL: 'appDetail',
  APP_NEW: 'appNew',
  APP_UPDATE_SOURCE: 'appUpdateSource',
  APP_UPDATE_META: 'appUpdateMeta',
  APP_UPLOAD_IMAGE: 'appUploadImage',
  APP_INSTALL: 'appInstall',
  APP_EXPORT: 'appExport',
  APP_UNINSTALL: 'appUninstall',
  TABLE_DATA_FETCH: 'tableDataFetch',
  APP_HISTORY_FETCH: 'appHistoryFetch',
  APPROVAL_LIST: 'approvalList',
  APPROVAL_DECIDE: 'approvalDecide',
  APPROVAL_HISTORY: 'approvalHistory',
  APP_APPROVAL_LIST: 'appApprovalList',
  APP_APPROVAL_DECIDE: 'appApprovalDecide',
  APP_RUNS_ACTIVE: 'appRunsActive',
  APP_RUNS_LIST: 'appRunsList',
  APP_RUN: 'appRun',           // stream — run an app runnable; end_all carries its outputs
  OPEN_WINDOW: 'openWindow', // main process only — opens a page (app, run, workflow) in its own window
  // Variables
  VARIABLE_LIST: 'variableList',
  VARIABLE_NEW: 'variableNew',
  VARIABLE_EDIT: 'variableEdit',
  VARIABLE_DUPLICATE: 'variableDuplicate',
  VARIABLE_DELETE: 'variableDelete',
  VARIABLE_USAGE: 'variableUsage',
  VARIABLE_EXPORT_ALL: 'variableExportAll',
  // Trash
  TRASH_LIST: 'trashList',
  TRASH_RESTORE: 'trashRestore',
  TRASH_DELETE: 'trashDelete', // delete for good: { ids }
  TRASH_EMPTY: 'trashEmpty',
  // Backup
  FULL_BACKUP: 'fullBackup',
  FULL_RESTORE: 'fullRestore',
  BACKUP_CAPABILITIES: 'backupCapabilities',
  // Tags
  TAG_LIST: 'tagList',
  TAG_NEW: 'tagNew',
  TAG_RENAME: 'tagRename',
  TAG_DELETE: 'tagDelete',
  // Schedules
  SCHEDULE_LIST: 'scheduleList',
  SCHEDULE_SET: 'scheduleSet',
  SCHEDULE_REMOVE: 'scheduleRemove',
  SCHEDULE_TOGGLE: 'scheduleToggle',
  // System
  CORE_LAUNCH: 'coreLaunch',
  CORE_VERSION_CHECK: 'coreVersionCheck',
  CORE_RESTART: 'coreRestart',
  AUTO_START_GET: 'autoStartGet',
  AUTO_START_SET: 'autoStartSet',
  APP_VERSION: 'appVersion',
  APP_UPDATE_STATE: 'appUpdateState',
  APP_UPDATE_INSTALL: 'appUpdateInstall',
  STATUS: 'status',
  STOP: 'stop',
  // Settings
  SETTINGS_LIST: 'settingsList',
  SETTINGS_SET: 'settingsSet',
  SETTINGS_GET_API_TOKEN: 'settingsGetApiToken',
  // Result cache
  CACHE_LIST: 'cacheList',
  CACHE_CLEAR: 'cacheClear',
  // Agent — stream: run by natural-language prompt, listen on `agent:<correlationId>`
  AGENT_PROMPT: 'agentPrompt',
  AGENT_RUN: 'agentRun',
  AGENT_DRAFT: 'agentDraft',
  AGENT_RUN_LIST: 'agentRunList',
  ASSISTANT_FINDABILITY: 'assistantFindability',
  AGENT_RUN_SET_PIPELINE: 'agentRunSetPipeline',
  // Plugins
  PLUGIN_LIST: 'pluginList',
  PLUGIN_SCAN: 'pluginScan',
  PLUGIN_DETAIL: 'pluginDetail',
  PLUGIN_SET_ENABLED: 'pluginSetEnabled',
  PLUGIN_REMOVE: 'pluginRemove',
  PLUGIN_USAGE: 'pluginUsage',
  // Projects
  PROJECT_LIST: 'projectList',
  PROJECT_NEW: 'projectNew',
  PROJECT_DETAIL: 'projectDetail',
  PROJECT_UPDATE: 'projectUpdate',
  PROJECT_DELETE: 'projectDelete',
  PROJECT_DELETE_PREVIEW: 'projectDeletePreview',
  PROJECT_ASSIGN_TASK: 'projectAssignTask',
  PROJECT_UNASSIGN_TASK: 'projectUnassignTask',
  PROJECT_ASSIGN_APP: 'projectAssignApp',
  PROJECT_UNASSIGN_APP: 'projectUnassignApp',
  PROJECT_EXPORT: 'projectExport',
  PROJECT_IMPORT: 'projectImport',
  // Server auth (login to remote Tipeline Server to get a token)
  SERVER_LOGIN: 'serverLogin',
  SERVER_LOGIN_MFA: 'serverLoginMfa',
  SERVER_ME: 'serverMe',
  // Server user management — calls the server's REST API
  SERVER_USERS_LIST: 'serverUsersList',
  SERVER_USER_CREATE: 'serverUserCreate',
  SERVER_USER_UPDATE: 'serverUserUpdate',
  SERVER_USER_DEACTIVATE: 'serverUserDeactivate',
  // Server webhook management — calls the server's REST API
  SERVER_WEBHOOK_LIST: 'serverWebhookList',
  SERVER_WEBHOOK_CREATE: 'serverWebhookCreate',
  SERVER_WEBHOOK_UPDATE: 'serverWebhookUpdate',
  SERVER_WEBHOOK_DELETE: 'serverWebhookDelete',
  SERVER_WEBHOOK_ROTATE: 'serverWebhookRotate',
  // Server API tokens — calls the server's REST API
  SERVER_TOKEN_LIST: 'serverTokenList',
  SERVER_TOKEN_CREATE: 'serverTokenCreate',
  SERVER_TOKEN_ROTATE: 'serverTokenRotate',
  SERVER_TOKEN_REVOKE: 'serverTokenRevoke',
  // Server MFA (security) — calls the server's REST API
  SERVER_MFA_STATUS: 'serverMfaStatus',
  SERVER_MFA_ENROLLMENT: 'serverMfaEnrollment',
  SERVER_MFA_ENROLL: 'serverMfaEnroll',
  SERVER_MFA_CONFIRM: 'serverMfaConfirm',
  SERVER_MFA_DISABLE: 'serverMfaDisable',
  // Server ownership + audit — calls the server's REST API
  SERVER_TASK_OWNERSHIP_LIST: 'serverTaskOwnershipList',
  SERVER_TASK_VISIBILITY_UPDATE: 'serverTaskVisibilityUpdate',
  SERVER_PIPELINE_AUDIT_LIST: 'serverPipelineAuditList',
  SERVER_AUDIT_LOG_LIST: 'serverAuditLogList',
  // Connections (workspace switching — handled locally in main)
  CONNECTION_LIST: 'connectionList',
  CONNECTION_ADD: 'connectionAdd',
  CONNECTION_REMOVE: 'connectionRemove',
  CONNECTION_UPDATE: 'connectionUpdate',
  CONNECTION_SET_ACTIVE: 'connectionSetActive',
  CONNECTION_GET_ACTIVE: 'connectionGetActive',
  // Hubs
  HUB_LIST: 'hubList',
  HUB_ADD: 'hubAdd',
  HUB_REMOVE: 'hubRemove',
  HUB_UPDATE: 'hubUpdate',
  HUB_SET_ENABLED: 'hubSetEnabled',
  HUB_CATALOG: 'hubCatalog',
  HUB_INSTALL_TASK: 'hubInstallTask',
  HUB_PREVIEW_TASK: 'hubPreviewTask',
  HUB_INSTALL_APP: 'hubInstallApp',
  HUB_INSTALL_PLUGIN: 'hubInstallPlugin',
  HUB_UPDATE_TASK: 'hubUpdateTask',
  HUB_UPDATE_APP: 'hubUpdateApp',
  HUB_UPDATE_PLUGIN: 'hubUpdatePlugin',
  HUB_PREVIEW_UPDATE: 'hubPreviewUpdate',
  HUB_UPDATE_EVENTS: 'hubUpdateEvents',
  HUB_UPDATE_EVENTS_READ: 'hubUpdateEventsRead',
  HUB_CHECK_ALL: 'hubCheckAll',
  HUB_CHECK_ONE: 'hubCheckOne',
  HUB_SET_TASK_AUTO_UPDATE: 'hubSetTaskAutoUpdate',
  HUB_SET_APP_AUTO_UPDATE: 'hubSetAppAutoUpdate',
  HUB_SET_PLUGIN_AUTO_UPDATE: 'hubSetPluginAutoUpdate',
} as const;

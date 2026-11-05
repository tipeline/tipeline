# IPC Protocol

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

Tipeline uses **node-ipc** for local inter-process communication between the CLI/Desktop and the Core engine. All messages follow a simple request/response pattern over a Unix domain socket.

## Message Format

Every message — in both directions — uses the same envelope:

```typescript
interface IPCMessage<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | ActionErrorData | null;
  correlationId: string | null;
}
```

### `ActionErrorData`

When an action fails, the error includes context:

```typescript
interface ActionErrorData {
  message: string;
  group: string;
  name: string;
  position: number;
  identifier: string;
}
```

## Request/Response Pattern

Every operation has a **send channel** and a matching **receive channel** prefixed with `on`:

| Send | Receive | Description |
|------|---------|-------------|
| `taskList` | `onTaskList` | List all tasks |
| `taskDetail` | `onTaskDetail` | Get one task |
| `taskNew` | `onTaskNew` | Create a task |
| `taskUpdateSource` | `onTaskUpdateSource` | Update task YAML |
| `taskInstall` | `onTaskInstall` | Import from file |
| `taskUninstall` | `onTaskUninstall` | Delete task |
| `taskValidate` | `onTaskValidate` | Validate YAML |
| `taskReload` | `onTaskReload` | Refresh from file |
| `taskExport` | `onTaskExport` | Export to file |
| `run` | streamed events (below) | Run from source |
| `exec` | streamed events (below) | Run an installed task |
| `pipelineList` | `onPipelineList` | List pipeline history |
| `pipelineDetail` | `onPipelineDetail` | Get pipeline detail |
| `pipelineStats` | `onPipelineStats` | Runs started and failed per period (`{ boundaries }`: ascending ISO instants) |
| `pipelineResume` | `onPipelineResume` | Resume failed pipeline |
| `pipelineCancel` | `onPipelineCancel` | Cancel a run (`{ pipelineIdentifier }`, or `{ correlationId }` of the request that started a run that doesn't persist; optional `canceledBy`). Answers `{ status: 'canceling' \| 'canceled' \| 'not_running' }` |
| `variableList` | `onVariableList` | List global variables |
| `variableNew` | `onVariableNew` | Create global variable |
| `variableEdit` | `onVariableEdit` | Update global variable |
| `variableDelete` | `onVariableDelete` | Delete global variable |
| `appList` | `onAppList` | List apps |
| `appDetail` | `onAppDetail` | Get app |
| `appNew` | `onAppNew` | Create app |
| `appUpdateSource` | `onAppUpdateSource` | Update app source |
| `appInstall` | `onAppInstall` | Import app |
| `appUninstall` | `onAppUninstall` | Delete app |
| `appRun` | stream (`onTaskStart` … `onTaskEndAll`) | Run an app runnable; `onTaskEndAll` carries `{ taskIdentifier, pipelineIdentifier, outputs, status }` (`status: 'paused'` when the run stopped at an approval) |
| `appHistoryFetch` | `onAppHistoryFetch` | Read past-run rows for an app history runnable |
| `appApprovalList` | `onAppApprovalList` | Pending approvals of an app's workflows (`{ appIdentifier, workflows? }`) |
| `appApprovalDecide` | `onAppApprovalDecide` | Approve/reject a run of one of the app's workflows (`{ appIdentifier, pipelineIdentifier, approved, comment? }`) |
| `appRunsActive` | `onAppRunsActive` | App runs in progress (`{ appIdentifier, pageId? }`): `correlationId`, `runnable`, `pipelineIdentifier`, `startedAt`, `steps`, `lastStep` each |
| `approvalList` | `onApprovalList` | Pending approvals, optionally for some workflows (`{ taskIdentifiers? }`) |
| `approvalDecide` | `onApprovalDecide` | Approve/reject a paused run and resume it (`{ pipelineIdentifier, approved, comment?, decidedBy? }`) |
| `approvalHistory` | `onApprovalHistory` | Decided approvals, newest first: who, when, comment (`{ taskIdentifiers?, limit? }`) |
| `scheduleList` | `onScheduleList` | List schedules |
| `scheduleSet` | `onScheduleSet` | Create a schedule: `{ identifier, when \| cron \| everySeconds \| runAt, variables }` |
| `scheduleRemove` | `onScheduleRemove` | Delete schedule |
| `status` | `onStatus` | Core engine status |
| `stop` | `onStop` | Shut down engine |
| `settingsList` | `onSettingsList` | List all settings |
| `settingsSet` | `onSettingsSet` | Set a setting |


### More channels

Every request channel answers on `on` + its name with the first letter capitalized
(`hubList` → `onHubList`). The handlers live in `apps/core/src/engine/handlers/`, one file per
area; each calls the `Core` method of the same name.

| Area | Channels |
|------|----------|
| Assistant | `agentRunComplete`, `agentRunCreate`, `agentRunFail`, `agentRunList`, `agentRunMarkProposed`, `agentRunMarkTaskRunning`, `agentRunSetPipeline`, `assistantFindability`, `taskMarkReady` |
| Hubs | `hubAdd`, `hubCatalog`, `hubCheckAll`, `hubCheckOne`, `hubInstallApp`, `hubInstallPlugin`, `hubInstallTask`, `hubList`, `hubPreviewTask`, `hubPreviewUpdate`, `hubUpdateEvents`, `hubUpdateEventsRead`, `hubRemove`, `hubSetAppAutoUpdate`, `hubSetEnabled`, `hubSetPluginAutoUpdate`, `hubSetTaskAutoUpdate`, `hubUpdate`, `hubUpdateApp`, `hubUpdatePlugin`, `hubUpdateTask` |
| Plugins | `pluginDetail`, `pluginList`, `pluginRemove`, `pluginScan`, `pluginSetEnabled`, `pluginUsage` |
| Projects | `projectAssignApp`, `projectAssignTask`, `projectDelete`, `projectDeletePreview`, `projectDetail`, `projectExport`, `projectImport`, `projectList`, `projectNew`, `projectUnassignApp`, `projectUnassignTask`, `projectUpdate` |
| Tags | `tagDelete`, `tagList`, `tagNew`, `tagRename` |
| Connections (workspaces) | `connectionAdd`, `connectionGetActive`, `connectionList`, `connectionRemove`, `connectionSetActive`, `connectionUpdate` |
| Cache | `cacheClear`, `cacheList` |
| Debugging | `debugNext`, `debugPause`, `debugRun`, `debugStop` |
| Backup | `fullBackup`, `fullRestore` |
| Workflows, apps, runs, variables, settings | `appExport`, `appRunsList`, `appUpdateMeta`, `appUploadImage`, `pipelineClear`, `pipelineClearAll`, `scheduleToggle`, `scriptPreview`, `settingsGetApiToken`, `tableDataFetch`, `taskDuplicate`, `taskExportAll`, `taskUpdateMeta`, `taskUploadImage`, `taskUsage`, `variableDuplicate`, `variableExportAll`, `variableUsage` |

### Streamed run events

`run` and `exec` don't answer on one channel: the run streams `onTaskStart`, `onAction`,
`onActionError`, `onDebugPaused`, `onTaskEnd`, then `onTaskEndAll` (or `onTaskError`), each
carrying the request's `correlationId`.

## Streaming Events

Execution events are broadcast **independently** of the request/response cycle. All connected clients receive these automatically:

| Event | Description |
|-------|-------------|
| `onTaskStart` | A run started (`pipelineIdentifier`, task) |
| `onAction` | A step finished: its name, params, result, destination |
| `onActionError` | A step failed |
| `onDebugPaused` | A debug run paused before a step |
| `onTaskEnd` | A run (or a sub-workflow's run) finished, with its status |
| `onTaskEndAll` | The whole run, sub-workflows included, finished |
| `onTaskError` | The run failed |

Each event's `correlationId` matches the request that started the run; a scheduled run gets
its own. Inside Core these travel on the `coreEvents` bus as `taskStart:<correlationId>`,
`action:<correlationId>` and so on, and `TaskStreamListener` turns them into the events
above.

## Desktop IPC Bridge

In the Electron app, the renderer process cannot directly use `node-ipc`. Communication goes through the preload script via `contextBridge`:

```typescript
// In renderer (Vue component)
const result = await window.electron.invoke('ipc:send', {
  channel: 'taskList',
  payload: {}
});

// Shorthand via composable
import { invokeCore } from '@/composables/invokeCore';
const tasks = await invokeCore(SEND.TASK_LIST);
```

The Electron main process bridges this to the IPC socket:

```typescript
ipcMain.handle('ipc:send', async (_, { channel, payload }) => {
  return await ipcService.send(channel, payload);
});
```

## IPC Channel Constants

The Desktop renderer names its requests with the constants in `apps/desktop/src/ipc-channels.ts`
(`SEND`). Some of these are renderer-side names that the Electron main process maps to a Core
channel (`apps/desktop/electron/main/utils/ipc-channels.ts`): `taskExec` becomes Core's `exec`,
`taskRun` becomes `run`.

```typescript
export const SEND = {
  TASK_LIST: 'taskList',
  TASK_DETAIL: 'taskDetail',
  TASK_NEW: 'taskNew',
  TASK_EXEC: 'taskExec',
  TASK_RUN: 'taskRun',
  PIPELINE_LIST: 'pipelineList',
  PIPELINE_RESUME: 'pipelineResume',
  PIPELINE_CANCEL: 'pipelineCancel',
  // ...
} as const;
```

In the Desktop, always use these constants rather than raw strings. Other clients (the CLI, a
WebSocket script) use Core's channel names from the tables above.

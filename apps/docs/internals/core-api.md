# Core Engine API

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

`Core.ts` is the central API of the engine. It exposes static methods used by all IPC/WebSocket handlers. This page documents the full API surface.

## System

```typescript
Core.status(): Promise<{ status: string; pid: number; uptime: number; version: string; activeRuns?: number; supervised: boolean }>
Core.stop(): Promise<void>
Core.install(): Promise<void>  // run migrations
```

## Task Management

```typescript
// List all tasks
Core.taskList(): Promise<Task[]>

// Get a single task
Core.taskDetail(identifier: string): Promise<Task>

// Create a new task record
Core.taskNew(data: {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  source: string;      // YAML/JSON string
  source_type?: 'local' | 'hub';
}): Promise<Task>

// Update a task's source YAML
Core.taskUpdateSource(identifier: string, source: string): Promise<Task>

// Import from file path
Core.taskInstall(path: string): Promise<Task>

// Delete task + all pipelines
Core.taskUninstall(identifier: string): Promise<void>

// Validate YAML without executing
Core.taskValidate(path: string): Promise<{ valid: boolean; errors?: string[] }>

// Refresh source from a file
Core.taskReload(identifier: string, path: string): Promise<Task>

// Export to a file
Core.taskExport(identifier: string, targetPath: string): Promise<void>
```

## Task Execution

```typescript
// Run a task from an in-memory source object (fire-and-forget, streams events)
Core.run(payload: {
  source: string;     // YAML/JSON string
  variables?: Record<string, any>;
}, correlationId: string): Promise<void>

// Execute an installed task by identifier
Core.exec(
  identifier: string,
  variables?: Record<string, any>,
  stepMode?: boolean,
  debugMode?: boolean
): Promise<{ correlationId: string }>
```

Both methods submit to `JobRunner` for queued execution. Events stream back via `taskStart`, `action`, `taskEnd`.

## Pipeline Management

```typescript
// List execution history for a task
Core.pipelineList(taskIdentifier: string): Promise<Pipeline[]>

// Full detail with actions and variables
Core.pipelineDetail(pipelineId: number): Promise<PipelineDetail>

// Runs started, and failed, between each pair of ascending ISO boundaries (n + 1 for n periods)
Core.pipelineStats(boundaries: string[]): Promise<{ from: string; to: string; total: number; failed: number }[]>

// Resume a failed pipeline
Core.pipelineResume(
  pipelineId: number,
  variables?: Record<string, any>
): Promise<{ correlationId: string }>

// Cancel a run. A running one ends right away as `canceled`, including the step running now,
// with the sync sub-workflows it waits for; one waiting
// for an approval ends right away. Runs that don't persist are named by the correlationId
// of the request that started them.
Core.pipelineCancel(params: {
  pipelineIdentifier?: string;
  correlationId?: string;
  canceledBy?: string;
}): Promise<{ status: 'canceling' | 'canceled' | 'not_running' }>
```

## Variable Management

```typescript
Core.variableList(): Promise<GlobalVariable[]>

Core.variableNew(data: {
  name: string;
  type: string;
  value: any;
  secret?: boolean;
  readonly?: boolean;
}): Promise<GlobalVariable>

Core.variableEdit(identifier: string, data: Partial<GlobalVariable>): Promise<GlobalVariable>

Core.variableDelete(identifier: string): Promise<void>
```

## App Management

Apps are desktop dashboards whose actions are backed by workflows. Their source
follows the App v2 schema (`packages/schemas/src/App.ts`, see
[Apps](/apps/)); every write path migrates v1 sources and validates.

```typescript
Core.appList(): Promise<App[]>
// source normalized to v2; `source_error` set when it can't be read
Core.appDetail(identifier: string): Promise<App & { source_error: string | null }>
Core.appNew(data: { name: string; description?: string; source?: unknown }): Promise<App>
Core.appUpdateSource(identifier: string, source: unknown): Promise<App>  // throws app.validationFailed
Core.appInstall(path: string): Promise<App>
Core.appUninstall(identifier: string): Promise<void>

// Runnables — resolved from the app's stored source, never from the caller
Core.appRun(
  params: { appIdentifier: string; pageId: string; runnable: string; inputs?: Record<string, unknown> },
  correlationId: string
): Promise<{ taskIdentifier: string }>
Core.appHistoryFetch(params: { appIdentifier: string; pageId: string; runnable: string }): Promise<object[]>

// Approvals — runs paused at an approval.request step
Core.approvalList(taskIdentifiers?: string[]): Promise<PendingApproval[]>   // incl. expiresAt / onTimeout when the request has a timeout
Core.approvalDecide(params: { pipelineIdentifier: string; approved: boolean; comment?: string; decidedBy?: string }): Promise<{ pipelineIdentifier: string; approved: boolean }>
Core.approvalHistory(params?: { taskIdentifiers?: string[]; limit?: number }): Promise<ApprovalDecision[]>   // newest first
Core.appApprovalList(params: { appIdentifier: string; workflows?: string[] }): Promise<PendingApproval[]>   // only the app's workflows
Core.appApprovalDecide(params: { appIdentifier: string; pipelineIdentifier: string; approved: boolean; comment?: string }): Promise<{ pipelineIdentifier: string; approved: boolean }>
```

`approvalDecide` atomically moves the run from `paused` back to `running` (a second
decision fails with "already decided"), stores the decision under the step's key in the
run's metadata and resumes the run in the background; the `approval.request` step then
returns the decision.

`appRun` only accepts inputs the runnable declares, targeting non-private workflow
variables; requested outputs must be non-private and non-secret. `persist: false`
runs the workflow without writing pipeline history.

## Schedule Management

```typescript
// Each entry: { scheduleIdentifier, taskIdentifier, taskName, cron, everySeconds,
// runAt, variables, enabled, nextRunAt, lastRunAt }. Exactly one of cron,
// everySeconds and runAt is set.
Core.scheduleList(): Promise<ScheduleEntry[]>

// Exactly one of `when` (plain words or a cron, read by parseSchedule in
// @tipeline/utils), `cron` (5 or 6 fields), `everySeconds` (an interval, counted
// from when it's turned on), or `runAt` (ISO time, runs once).
// "every 40 seconds" becomes everySeconds: 40; "every 30 seconds" a cron.
// Refused: closer than every 10 seconds, a time already gone, a draft.
Core.scheduleSet(
  taskIdentifier: string,
  options: {
    when?: string;
    cron?: string;
    everySeconds?: number;
    runAt?: string;
    variables?: Record<string, any>;
  }
): Promise<string> // the schedule identifier

// Refuses to turn on a one-time schedule that has run or whose time has passed.
Core.scheduleToggle(scheduleIdentifier: string, enabled: boolean): Promise<void>

// With withSchedule, also turns on the schedule the assistant proposed with the
// draft (metadata.draftSchedule: { when, cron, everySeconds, runAt }). If it can't start, `scheduleError` says why;
// the workflow is marked ready either way.
Core.taskMarkReady(identifier: string, withSchedule?: boolean)

Core.scheduleRemove(scheduleIdentifier: string): Promise<void>
```

## Plugin Management

```typescript
Core.pluginList()
Core.pluginScan()                                   // re-read ~/Tipeline/plugins
Core.pluginDetail(identifier: string)
Core.pluginSetEnabled(identifier: string, enabled: boolean)
Core.pluginRemove(identifier: string)
Core.pluginUsage(group: string): Promise<{ count: number; tasks: { name: string; identifier: string }[] }>
```

## Hub Management

```typescript
Core.hubList() / Core.hubAdd(data) / Core.hubUpdate(id, data) / Core.hubRemove(id) / Core.hubSetEnabled(id, enabled)
// Hubs come back with `hasToken` in place of the remote hub's access token, which never leaves Core.
Core.hubCatalog(hubId)
Core.hubPreviewTask(hubId, itemIdentifier)
Core.hubInstallTask(hubId, itemIdentifier) / Core.hubInstallApp(...) / Core.hubInstallPlugin(...)
Core.hubUpdateTask(identifier) / Core.hubUpdateApp(identifier) / Core.hubUpdatePlugin(identifier)
Core.hubCheckAll() / Core.hubCheckOne(hubId)
Core.hubSetTaskAutoUpdate(identifier, autoUpdate) // also App / Plugin
```

## Assistant

```typescript
Core.draftCreate(yaml: string)          // check, then install as a draft
Core.taskMarkReady(identifier: string)  // clear the draft flag
Core.assistantFindability()             // the Search tips list
Core.agentRunList() / agentRunCreate() / agentRunComplete() / agentRunFail() …
```

The assistant itself (provider calls, search, drafting) runs in `@tipeline/agent`, in the
Desktop main process or the CLI — not in Core. It reaches Core through the
[MCP server](/assistant/mcp).

## Settings

```typescript
Core.settingsList(): Promise<Setting[]>
Core.settingsSet(key: string, value: string): Promise<void>
Core.getApiToken(): Promise<string>   // the token for WebSocket and MCP
```

## Return Types

All methods return plain objects (no ORM model instances). The serialized shapes are what clients receive over IPC/WebSocket.

### Task

```typescript
{
  id: number;
  identifier: string;         // 21-char nanoid
  name: string;
  description: string;
  author: string;
  version: string;
  source: string;             // raw YAML
  source_type: 'local' | 'hub';
  created_at: string;
  updated_at: string;
}
```

### Pipeline

```typescript
{
  id: number;
  identifier: string;
  task_id: number;
  status: 'pending' | 'running' | 'failed' | 'completed' | 'canceled' | 'paused';
  started_at: string;
  finished_at: string;
}
```

### PipelineDetail

```typescript
{
  pipeline: Pipeline;
  actions: PipelineAction[];
  variables: PipelineVariable[];
}
```

### PipelineAction

```typescript
{
  id: number;
  position: number;
  identifier: string;
  status: string;
  result: any;               // deserialized from JSON
  error: string;
  started_at: string;
  finished_at: string;
}
```

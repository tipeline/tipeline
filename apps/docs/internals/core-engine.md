# Core Engine

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

The Core engine (`apps/core`) is the long-lived background process that runs every workflow. The Desktop app, the CLI, the Tipeline Server and AI clients are all front ends to it.

## Responsibilities

| Responsibility | What it does |
|----------------|-------------|
| **Action execution** | Instantiates and runs individual actions (browser, file, AI, SSH, plugins, …) |
| **Task orchestration** | Loads task definitions, resolves variables, sequences action execution |
| **Pipeline persistence** | Records every run to SQLite with per-action status for history, resume and debug |
| **Scheduling and jobs** | Runs schedules, and hands every run to a job runner (Bree or BullMQ) |
| **Hubs and plugins** | Loads plugins from `~/.tipeline/plugins`, checks hubs for updates every hour |
| **Transports** | Answers over IPC (local), WebSocket (remote, port 4000) and MCP (AI clients, port 4002) |

## Entry Points

| Entry | Purpose |
|-------|---------|
| `src/engine/Server.ts` | Starts IPC + WebSocket listeners — the main production entry |
| `src/engine/Core.ts` | Static API class — all business logic is here |
| `src/engine/IpcTaskListener.ts` | Routes incoming IPC/WebSocket messages to handlers |
| `src/engine/handlers/` | One file per area (`taskHandlers`, `appHandlers`, `hubHandlers`, `agentHandlers`, …) |
| `src/engine/McpServer.ts` | The MCP tool server the assistant and outside AI clients use — see [Connect AI tools (MCP)](/assistant/mcp) |
| `src/engine/runner/` | Job runners: `BreeRunner` (default) and `BullMQRunner` — see [Job Runners](/internals/job-runners) |

## Process Lifecycle

CLI (`tipeline start`) and Desktop (`CoreLauncher.ts`) each spawn `dist/engine/Server.js` as a
detached process, so Core keeps running after they close, or through the auto-start service when
it's on. There is no process manager of our own.

- **One Core at a time.** Core claims `~/.tipeline/tipeline.pid` first thing on startup
  (`engine/CoreLock.ts`), before it opens the database or the IPC socket. If another Core holds
  it, the new one exits. Launchers never write this file; they only read it, through
  `@tipeline/utils/coreProcess`.
- **Stale files.** A hard kill or a reboot leaves the file behind. A pid only counts if that
  process's command line is a Core, so a pid reused by another program is ignored, never signaled.
- **Fatal errors.** An uncaught exception or unhandled rejection is logged to
  `~/.tipeline/logs/start.log` and Core exits with code 1.
- **Auto-start** (`@tipeline/utils/coreService`). A launchd agent on macOS, a systemd user service
  on Linux, the per-user Run key on Windows. launchd and systemd restart Core after a non-zero
  exit or a kill; a normal stop or a duplicate Core exits 0 and stays down. Windows only starts it
  at login. On by default in the packaged app, set up on first open unless the CLI already set it
  up (`~/.tipeline/.auto-start-decided` keeps a later "off" off), never automatically in dev builds.
  The service belongs to whoever set it up: Desktop neither rewrites nor starts the CLI's, and
  `tipeline start` runs the CLI's own Core when the service is Desktop's. A service-run Core has
  `TIPELINE_SUPERVISED=1` and reports `supervised` in `Core.status()`. When Desktop's auto-start is
  on but Desktop's Core started another way, Desktop moves it under the service the next time it
  opens and nothing is active. It leaves a Core running from the CLI alone unless it's outdated.
- **Reconnecting.** Desktop's error screen leaves by itself on `core:reconnected`, however Core came
  back. launchd holds restarts to one per 30 seconds, so a Core that had only just started can take
  that long.
- **Updates.** When Desktop opens and finds a running Core older than the one it ships, it restarts
  Core if `activeRuns` is 0, otherwise it offers a restart. The comparison uses the `version` in
  `apps/core/package.json`, so a release that changes Core has to bump it.

## Action System

### Action Base Class (`src/action/Action.ts`)

```typescript
class Action {
  group: string;
  name: string;
  params: Record<string, any>;
  rawParams: Readonly<Record<string, any>>;  // frozen copy
  destination?: string;
  onError: 'throw' | 'continue';
  disabled: boolean;
  identifier: string;

  async execute(task: Task, lastResult: any): Promise<any>
}
```

The `rawParams` are frozen at construction to allow loops to re-run actions with fresh parameter resolution each iteration (parameters are re-evaluated from `rawParams` each time `execute()` is called).

### Action Registry (`src/action/ActionRegistry.ts`)

`ActionRegistry` is a static map from group name to the group's handler class:

```typescript
ActionRegistry.register({
  browser:     GroupBrowser,
  string:      GroupString,
  http:        GroupHttp,
  ai:          GroupAI,
  // ... 32 groups total (plugins add theirs to PluginActionRegistry)
});
```

When an action executes, the registry looks up the class and calls the matching static method:

```typescript
const handler = ActionRegistry.get(action.group);
const result = await handler[action.name](resolvedParams, task, lastResult, action);
```

### Action Factory (`src/action/ActionFactory.ts`)

`ActionFactory.create(rawConfig)` instantiates `Action` objects from plain JSON/YAML objects. It reads the `group`, `name`, `params`, `destination`, `onError`, and `disabled` fields.

### Group Handler Pattern

Every action group (`GroupBrowser`, `GroupString`, …) follows the same pattern:

1. Validate params with the Zod runtime schema from `@tipeline/schemas`
2. Execute the core logic
3. Return a typed result

```typescript
// Example: GroupString
static camelCase(params: CamelCaseParams): string {
  const { string } = validations.string.camelCase.runtime.parse(params);
  return _.camelCase(string);
}

// Example: GroupAI (async, external API)
static async prompt(params: PromptParams): Promise<string> {
  const { provider, model, systemPrompt, userPrompt, apiKey } =
    validations.ai.prompt.runtime.parse(params);
  const response = await axios.post(url, body, { headers });
  return GroupAI.extractResponse(provider, response.data);
}
```

## Task System

### Task (`src/task/Task.ts`)

`Task` is an in-memory representation of a task definition. It holds:

- `name`, `description`, `identifier`, `correlationId`
- A `Pipeline` instance
- `callStack` — tracks nested subtask calls for debugging
- Methods: `run()`, `resume(pipelineId)`, `loadVariables()`, `loadActions()`

### Task Factory (`src/task/TaskFactory.ts`)

`TaskFactory` is the entry point for creating a `Task`:

```typescript
// From a YAML/JSON file path
const task = await TaskFactory.fromFile(path, overrides);

// From an in-memory source object
const task = await TaskFactory.fromSource(source, correlationId, overrides);
```

When loading from a file, the factory:

1. Loads `.env` from the task directory, then falls back to `~/.tipeline/.env`
2. Calls `Parser.importFromFile()` to parse YAML or JSON
3. Runs `TaskValidator.validateFormat()` against the task schema
4. Instantiates `Variable` objects and `Action` objects
5. Builds the `Pipeline` with all variables and actions

## Engine API (`src/engine/Core.ts`)

`Core` exposes a static API used by all handler functions. All methods return plain objects suitable for IPC serialization.

### System

```typescript
Core.status()                          // { status, pid, uptime, version, activeRuns, supervised }
Core.stop()                            // graceful shutdown
```

### Task Management

```typescript
Core.taskList()
Core.taskDetail(identifier)
Core.taskNew(data)
Core.taskUpdateSource(id, source)
Core.taskInstall(path)
Core.taskUninstall(identifier)
Core.taskValidate(path)
Core.taskReload(identifier, path)
Core.taskExport(identifier, targetPath)
```

### Task Execution

```typescript
Core.run(payload, correlationId)       // from in-memory source
Core.exec(identifier, variables?, stepMode?, debugMode?)  // by identifier
```

Both submit a job to the active job runner — Bree worker threads by default, or a BullMQ queue when `~/.tipeline/config.json` says so. See [Job Runners](/internals/job-runners).

### Pipeline Management

```typescript
Core.pipelineList(taskIdentifier)
Core.pipelineDetail(pipelineId)
Core.pipelineResume(pipelineId, vars?)
```

### Variable Management

```typescript
Core.variableList()
Core.variableNew(data)
Core.variableEdit(identifier, data)
Core.variableDelete(identifier)
```

### Schedule Management

```typescript
Core.scheduleList()
Core.scheduleSet(taskIdentifier, { when | cron | everySeconds | runAt, variables })
Core.scheduleToggle(scheduleIdentifier, enabled)
Core.scheduleRemove(scheduleIdentifier)
```

### Plugin Management

```typescript
Core.pluginList()
Core.pluginScan()                      // re-read ~/.tipeline/plugins
Core.pluginDetail(identifier)
Core.pluginSetEnabled(identifier, enabled)
Core.pluginRemove(identifier)
Core.pluginUsage(group)
```

### Hub Management

```typescript
Core.hubList() / hubAdd() / hubUpdate() / hubRemove() / hubSetEnabled()
Core.hubCatalog(hubId)
Core.hubInstallTask() / hubInstallApp() / hubInstallPlugin()
Core.hubUpdateTask() / hubUpdateApp() / hubUpdatePlugin()
Core.hubCheckAll() / hubCheckOne(hubId)
```

### Other areas

`Core` also covers projects (`project*`), apps and app runs (`app*`, `tableDataFetch`),
approvals (`approval*`), tags (`tag*`), backups (`fullBackup`, `fullRestore`,
`projectExport`, `projectImport`), the result cache (`cacheList`, `cacheClear`), settings
(`settingsList`, `settingsSet`) and the assistant (`agentRun*`, `draftCreate`,
`taskMarkReady`). The handler files under `src/engine/handlers/` map each IPC channel to
one of these methods.

## Path Aliases

The Core uses TypeScript path aliases (resolved at build time by `tsc-alias`):

| Alias | Maps to |
|-------|---------|
| `@/*` | `src/*` |
| `@step/*` | `src/step/*` |
| `@action/*` | `src/action/*` |
| `@pipeline/*` | `src/pipeline/*` |
| `@task/*` | `src/task/*` |
| `@engine/*` | `src/engine/*` |
| `@database/*` | `src/database/*` |
| `@variable/*` | `src/variable/*` |
| `@utils/*` | `src/utils/*` |
| `@validation/*` | `src/validation/*` |

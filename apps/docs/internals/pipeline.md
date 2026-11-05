# Pipeline System

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

A **pipeline** is the runtime record of one task run: the status of every action, the values of every variable, and the overall result. It's what the Desktop calls a **run**, and what powers history, resume and debug.

## Lifecycle

```
Task triggered (CLI / Desktop / app / schedule / webhook / assistant)
        │
        ▼
  Pipeline created → status: pending
        │
        ▼
  Execution starts → status: running
        │
        ├──── All actions complete ──────────▶ completed
        ├──── Action fails (onError: throw) ─▶ failed
        ├──── Someone cancels ───────────────▶ canceled
        └──── Debug mode pauses ─────────────▶ paused
```

A failed run can be **resumed** from the failing action, optionally with changed
variables: completed work is tracked per `(block, position)`, so a loop that failed on its
3rd iteration resumes inside that iteration.

## Pipeline (`src/pipeline/Pipeline.ts`)

A `Pipeline` is the top-level execution container for a single task run. It:

- Holds all `Variable` instances (mutable at runtime)
- Holds the flat list of `Action` instances
- Creates and manages `Block` instances
- Emits events: `taskStart:${correlationId}`, `taskEnd:${correlationId}`

### Execution Modes

| Method | Behaviour |
|--------|----------|
| `run()` | Creates a new pipeline record in the DB and starts from scratch |
| `resume(pipelineId)` | Loads an existing pipeline and continues from the first incomplete action |
| `runClean()` | Executes without any DB persistence — used for preview/test runs |

### Pipeline Status Values

`pending` → `running` → `completed` / `failed` / `canceled` / `paused`

## Block (`src/pipeline/Block.ts`)

A `Block` is the unit that actually executes a sequence of actions. The top-level pipeline creates a root block; flow control actions (`ifConditional`, `simpleLoop`, `forEachLoop`, …) create **child blocks** to handle their nested actions.

A flow step's own params (its condition, say) are resolved when it starts, but not the steps under its `params.actions`: each of those resolves its params right before it runs, in its child block. So a nested step sees what the steps before it set, and fails as itself.

### Block Execution Flow

```
Block.run()
  ├── Load completed action identifiers from DB (for resume support)
  ├── For each action (skipping completed & disabled):
  │   ├── Check DebugController (pause/step mode)
  │   ├── Resolve params via Variable.parseParams()
  │   ├── action.execute(task, lastResult)
  │   ├── Emit event: action:${correlationId}
  │   ├── If destination set → store result in variable
  │   ├── Update PipelineAction status in DB
  │   └── Handle error per onError policy
  └── Return last result
```

### Child Blocks (Loops & Conditionals)

Flow control actions like `simpleLoop` and `forEachLoop` call:

```typescript
const childBlock = await task.getPipeline().createChildBlock(actions, parentActionPosition, iteration);
await childBlock.run();
```

Child blocks are persisted in `pipeline_block` with a `parent_block_id` reference, allowing the resume system to pinpoint exactly which loop iteration failed.

## Resume System

The resume system tracks completed work at the `(block, position)` level, not just the action level.

On resume, each block calls `loadCompletedIdentifiers()`, which queries `pipeline_action` for rows with `status = 'completed'` in that block. Any action whose `identifier` is in this set is **skipped**.

This means:
- If iteration 3 of a 10-iteration loop fails at action 2, resume skips actions 0 and 1 of iteration 3 and retries from action 2.
- Actions from iterations 0–2 are untouched.

## Debug Mode

Debug mode allows step-by-step execution of a pipeline.

`DebugController` maintains per-`correlationId` state:

```typescript
DebugController.pause(correlationId)
DebugController.step(correlationId)
DebugController.resume(correlationId)
```

Inside `Block.run()`, before each action:

```typescript
if (DebugController.isStopped(correlationId)) {
  await DebugController.waitForNext(correlationId);
}
```

`waitForNext()` suspends the async execution until `step()` or `resume()` is called from the client (via IPC/WebSocket).

## Event System

Every pipeline execution emits structured events over a global `EventEmitter`, which is picked up by both the IPC and WebSocket transports and forwarded to all connected clients.

### Event Types

| Event | Payload | When |
|-------|---------|------|
| `taskStart:${correlationId}` | `{ correlationId, taskIdentifier }` | Pipeline starts |
| `action:${correlationId}` | `{ position, group, name, params, result, destination, status }` | Each action completes |
| `actionError:${correlationId}` | `{ position, group, name, error }` | Action throws an error |
| `taskEnd:${correlationId}` | `{ correlationId, status }` | Pipeline finishes |

## Non-Serializable Results

Some action results are live handles that cannot be stored in SQLite (Puppeteer `Browser`, SSH connections, image buffers, database connections). These are held **in memory** during the pipeline run and are `null`-ified before DB persistence. The `{= varName =}` raw injection syntax is how later actions receive these handles.

## Pipeline Services

The persistence layer is split into focused service classes:

| Service | Responsibility |
|---------|---------------|
| `PipelineService` | Create, update, and query pipeline records |
| `PipelineActionService` | Track per-action status, result, errors |
| `PipelineBlockService` | Create and manage block records |
| `PipelineVariableService` | Snapshot variable values per pipeline run |
| `PipelineRunnerService` | Coordinate pipeline start/end with DB updates |

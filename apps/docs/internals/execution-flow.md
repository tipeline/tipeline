# Execution Flow

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database and IPC messages keep the original `task` naming: this page says workflow in prose and keeps `task` only in code names (`Task`, `TaskFactory`, `taskStart`, `subtask.exec`).
:::

This page traces the complete lifecycle of a single workflow run — from the moment a user triggers a run to the final database record.

## High-Level Flow

```
User (CLI / Desktop / Remote)
        │
        │  IPC / WebSocket message: exec / run
        ▼
IpcTaskListener.ts
        │
        │  routes to pipelineHandlers.ts
        ▼
Core.exec(identifier, variables)
        │
        ├── 1. Load workflow from DB → TaskFactory.fromSource(source, correlationId, vars)
        │           │
        │           ├── Parse YAML/JSON
        │           ├── Validate schema (TaskValidator)
        │           ├── Load .env files
        │           ├── Instantiate Variable[]
        │           └── Instantiate Action[]
        │
        ├── 2. Submit to JobRunner (manages concurrency)
        │
        ▼
Pipeline.run()
        │
        ├── 3. PipelineRunnerService.startPipeline()   → DB: pipeline status = running
        │
        ├── 4. Emit event: taskStart:${correlationId}  → broadcast to all clients
        │
        ├── 5. Create root Block
        │
        ▼
Block.run()  [root block]
        │
        ├── For each Action (filtered: not disabled, not already completed):
        │   │
        │   ├── 6. DebugController check (pause/step)
        │   │
        │   ├── 7. Variable.parseParams(action.rawParams)
        │   │       ├── LiquidJS render for {{ }} templates
        │   │       ├── Raw injection for {= =} expressions
        │   │       └── Lazy-load _global.* if referenced
        │   │
        │   ├── 8. DB: PipelineActionService.updateStatus(running)
        │   │
        │   ├── 9. action.execute(task, lastResult)
        │   │       └── ActionRegistry[group][name](params, task, lastResult, action)
        │   │               └── GroupXxx.methodName(params)  ← actual work
        │   │
        │   ├── 10. If destination set → variables.set(destination, result)
        │   │         └── PipelineVariableService.updateValue()
        │   │
        │   ├── 11. DB: PipelineActionService.updateStatus(completed, result)
        │   │
        │   └── 12. Emit event: action:${correlationId}  → broadcast to all clients
        │
        │   [If action is a flow control action: ifConditional, simpleLoop, etc.]
        │   └── Creates child Block with nested actions → recursive Block.run()
        │
        ├── 13. PipelineRunnerService.finishPipeline()  → DB: pipeline status = completed
        │
        └── 14. Emit event: taskEnd:${correlationId}    → broadcast to all clients
```

## Error Handling in the Flow

When an action throws, the `onError` policy determines what happens:

| `onError` | Behaviour |
|-----------|----------|
| `throw` (default) | DB: pipeline status = `failed`; emit `actionError` event; stop execution |
| `continue` | The error is swallowed in `Action.execute()`: the step returns `undefined` and the run goes on to the next step |

Approval signals (`ApprovalPendingSignal`, `ApprovalRejectedSignal`) are never swallowed by
`continue`: they always reach the Block and Pipeline, which pause or end the run.

## Event Broadcasting

All events are emitted on a global `EventEmitter` in `Core` and picked up by two listeners:

1. **IPC Transport** — forwards to all connected local clients
2. **WebSocket Transport** — broadcasts to all authenticated WebSocket connections

The Desktop app's `stream` Pinia store maintains a circular buffer of the last 500 events, giving the UI a live activity feed.

## Correlation ID

Every execution is tagged with a `correlationId` — a nanoid (21 chars) — that namespaces all events for that run:

```
taskStart:abc123def456ghi7890xy
action:abc123def456ghi7890xy
taskEnd:abc123def456ghi7890xy
```

Clients subscribe to these namespaced events to receive results for a specific run without interference from concurrent executions.

## Concurrent Execution

`JobRunner` manages a queue of pipeline submissions. Multiple workflows can run concurrently; each gets its own `correlationId` and its own chain of events.

## Sub-workflow Execution

The `subtask.exec` action allows a workflow to call another workflow as a nested sub-pipeline. The called workflow runs inline within the caller's pipeline, sharing the parent's variable scope. The `callStack` on `Task` tracks the nesting depth for debugging.

### Async Sub-workflows

`subtask.exec` normally awaits the child workflow before the parent's next action runs — this is
the only form of concurrency available within a single pipeline; everything else in `Block.run()`
executes strictly one action at a time (see [Core Engine](../internals/core-engine.md)). Setting
`async: true` on `subtask.exec` is a narrow, deliberate exception, scoped to this one action:

- The parent continues immediately after launching the child; it does not wait for it to finish.
- `outputs` is rejected at the start of `exec()` when `async: true` — the parent has already moved
  on before the child produces a result, so there is nothing to read back.
- The child runs as its **own separate job** — a new Bree worker_thread or BullMQ sandboxed child
  process, exactly like a normal top-level `exec`/`run`/`resume` job — rather than in-process
  alongside the parent. `GroupSubtask.exec` never builds a child `Task` object itself for the async
  path; it builds a `JobPayload` and hands it to `submitDetachedJob()`
  (`apps/core/src/engine/worker/SubmitDetachedJob.ts`), which discriminates on whether
  `worker_threads.parentPort` is set: non-null means we're inside a Bree worker thread; `null` means
  we're inside a BullMQ sandboxed process.
  - **BullMQ**: opens its own `Queue` client (connected via `process.env.REDIS_URL`, which
    `BullMQRunner.ts` mirrors from its config before forking sandboxed workers) and `await`s
    `queue.add(...)` — a real round-trip to Redis.
  - **Bree**: `postMessage`s a `{ type: 'submitJob' }` message, fire-and-forget, that
    `BreeRunner.ts`'s existing `worker.on('message', ...)` handler picks up and forwards to its own
    `submit()`. This worker later sends `'done'` on the same `parentPort` once its own remaining
    actions finish, which is what triggers Bree to `terminate()` it — but messages on one
    `MessagePort` are delivered in order, so `submitJob` is always handled before `'done'` is even
    seen, let alone acted on. No acknowledgment round-trip is needed here — an earlier version of
    this added one, based on a plausible-sounding but ultimately incorrect worry about the message
    being dropped. The actual bug present the whole time was the variable-override type coercion
    gap described below; the message delivery was never the problem. Since this is the one place
    every detached job passes through on the Bree path, and nobody generated its correlationId
    ahead of time the way a top-level `exec`/`run`/`resume` request does, `BreeRunner.ts` also binds
    a `TaskStreamListener` for the child's correlationId right here — the same mechanism it already
    uses for cron jobs — so the child's progress streams live to IPC/WS clients instead of only
    surfacing on the next Desktop poll. See "Desktop UI implications" below for what this does and
    doesn't cover.
- The child is given a **new `correlationId`** instead of inheriting the parent's — same reasoning
  as before (`DebugController`'s per-correlationId step gate only holds one pending pause per id),
  now doubly true since it's a fully independent job rather than a second correlationId sharing one
  thread. `stepMode`/`debugMode` are never set on the job payload, so the child always runs
  non-interactively regardless of whether the parent is in a debug session — debug sessions are
  user-initiated per top-level invocation, and a nested `subtask.exec` has no business opting its
  child into or out of one.
- Nested sub-workflow circular-call detection (`Task.callStack`) and `shouldSave` inheritance now travel
  through the `JobPayload` (`callStack`, `shouldSave` fields on `IJobRunner.ts`'s `JobPayload`) since
  there's no in-process child `Task` for `JobExecutor.ts` to set them on directly — it reads them off
  the job instead, defaulting to `[]` and `true` respectively for every other (non-sub-workflow) caller.
- **`props` visibility is checked before submission, not after.** Synchronous `subtask.exec` relies
  on `Task.updateVariablesFromProps` throwing if a `props` key targets a `private`-visibility
  variable — but that check runs against an already-built child `Task`, which the async path never
  builds. The generic job-payload variable-override paths (`applyVariableOverrides` in
  `JobExecutor.ts`, `TaskFactory.fromFile`'s override loop) don't enforce this — they're designed for
  top-level CLI/API overrides, where there's no "parent" to protect against. So the async branch
  calls the same rule directly, via the shared `assertPropsVisibility()` helper
  (`apps/core/src/utils/assertPropsVisibility.ts`, which `Task.updateVariablesFromProps` also calls,
  so the two checks can't drift apart), against the child's declared variables *before* building the
  job payload at all.
- **Variable-override values are coerced to their declared type before the job's `Task` is built.**
  `applyVariableOverrides` (`JobExecutor.ts`, used by the `exec` job type) and `TaskFactory.fromFile`'s
  own override loop (`run` job type) mutate a variable's raw JSON declaration directly, before any
  `Variable` object exists — so they used to skip the type coercion `Variable`'s constructor and
  `setValue()` normally apply (e.g. turning a string `"5000"` into the number `5000`). Synchronous
  `subtask.exec` never hit this, since `Task.updateVariablesFromProps` always went through
  `Variable.setValue()`. The async path does, because `props` is threaded through the job payload's
  `variables` field into these override paths instead — and Desktop's `props` editor serializes
  values as strings, so an async sub-workflow with a numeric `props` entry would fail
  `TaskValidator.validateFormat()`'s type-strict check the moment the new job tried to load, with an
  error crediting a `pipeline.variables[N]` index rather than the actual prop that caused it. Fixed
  by extracting `Variable`'s coercion into a shared `coerceVariableValue()`
  (`apps/core/src/utils/coerceVariableValue.ts`) and calling it from both override sites — this isn't
  sub-workflow-specific, it fixes the same latent gap for any `exec`/`run` job given a loosely-typed
  variable override (CLI `--variables`, cron schedules), not just `props`.
- Nothing else about the execution model changes: `Pipeline`/`Block` internals, variable storage,
  and the sequential loop are untouched. Async only exists at the `subtask.exec` boundary.

This replaced an earlier, simpler design where the async child ran in-process (same thread/JS realm
as the parent, just unawaited), tracked via a `BackgroundTaskRegistry` that `JobExecutor.executeJob()`
drained before letting the worker tear down. That version worked, but it meant two actions could
genuinely interleave in one process for the first time in this codebase — see the next section for
why that turned out to matter in practice.

#### Desktop UI implications

**This section describes the BullMQ runner's behavior.** Under the default Bree runner, an async
child's `TaskStreamListener` (bound in `BreeRunner.ts` as described above) means its `start`/
`action`/`end` events broadcast live, exactly like a top-level run or a cron job — Desktop's
existing "insert a new row when a live `start` event arrives for a pipeline we've never fetched"
logic in `Activity.vue`/`HomeRecentActivity.vue` (keyed off `pipelineIdentifier` in the event data)
already handled this correctly once Core actually started sending the events; no Desktop code
changed. Under BullMQ, the gap below still stands — `submitDetachedJob()`'s BullMQ branch adds the
job straight to the Redis queue with no equivalent hook to bind a listener from, and replicating
one would mean inspecting every queued job's data to guess its origin rather than reusing an
existing mechanism, so it's deferred rather than done as part of the Bree fix.

Because a BullMQ async child never broadcasts, any Desktop view that only discovers or updates a
pipeline row via a live `start`/`action`/`end` event won't see it change on its own:

- `TaskHistoryTab.vue` (a workflow's own Runs tab) polls every 5s **while a row it already knows about
  is `running`**, re-fetching and patching just that row's status. This is safe there because a
  workflow's own history tab only ever shows that workflow's rows — an async child is a different
  workflow entirely, so it was never expected to appear on the parent's tab in the first place.
- `Activity.vue` (the global Runs page) and `HomeRecentActivity.vue` (the Home dashboard widget)
  poll unconditionally every 8s while mounted, merging fetched rows into the existing list —
  inserting new ones as well as updating known ones. Gating this on "something already-known is
  running" was tried and rejected: the parent (and every other already-discovered row) can finish
  and settle *before* the async child's row is ever first fetched, since its DB row often doesn't
  exist yet at the moment the page is opened either — that would stop polling right as the row is
  about to appear, not after.

None of this makes a BullMQ async child's progress stream live — that limitation stands as
described above. It only bounds how long a finished or newly-started async run stays invisible or
stuck on a stale status in these three views to one polling interval, instead of "until the page
happens to remount." This polling stays in place regardless of runner — it's a safety net against
missed events (dropped IPC/WS connection, Desktop restarted mid-run), not just a BullMQ workaround.

A synchronous `subtask.exec` (no `async: true`) is unaffected by any of this either way: it reuses
the parent's correlationId and runs inline in the same process/thread as the parent, so its events
ride the same already-live stream the parent's own events use — under **both** Bree and BullMQ,
before and after the fix described above.

| | Bree | BullMQ |
|---|---|---|
| Sync `subtask.exec` | live | live |
| Async `subtask.exec` | live | poll-only (≤8s delay) |

#### Process-global state — the bug that motivated job isolation

Before async sub-workflows ran as their own job, an in-process design (see above) meant two actions
could genuinely interleave on the same event loop for the first time in this codebase. Most actions
were fine with this — each call operates on its own local variables and its own Puppeteer
page/browser handle — but an action is **not** safe to run concurrently with itself if its
underlying implementation relies on process-global mutable state rather than call-scoped state.

We hit this in practice: `browser.runLighthouseAudit` wraps the `lighthouse` npm package, which
instruments navigation using Node's `perf_hooks` `performance.mark()`/`measure()`/`clearMarks()`
under fixed, non-namespaced names (e.g. `'lh:driver:navigate'`) rather than per-call scoped ones.
Two audits running concurrently in one process could have one audit's mark/clear stomp the other's,
surfacing as `The "start lh:driver:navigate" performance mark has not been set`. This is what
motivated moving async sub-workflows to their own job in the first place — real process isolation
eliminates the whole bug *category* at the root (any action wrapping a library with the same
fixed-name-global pattern would have been an equally live risk; `ocr`'s tesseract.js worker pooling
and `script`'s vm2 sandboxes were flagged as unaudited candidates), rather than requiring a bespoke
serialization fix for every affected action as it's discovered one at a time.

`apps/core/src/action/actions/browser/actions.ts` still carries a module-level promise-chain queue
(`GroupBrowser.lighthouseQueue`) serializing `lighthouse(...)` calls within a process — it predates
job isolation and is no longer *necessary* for the async sub-workflow case specifically, since a parent
and its async child can no longer land in the same process at all. It's left in place as a harmless
safety net (e.g. for any other, currently-nonexistent path that might run two audits in one process)
rather than removed; see the codebase for whether it's since been retired.

## Resume Flow

When resuming a failed pipeline:

```
Core.pipelineResume(pipelineId, variables?)
    │
    ├── Load pipeline record from DB
    ├── Load original workflow source from pipeline.source
    ├── Restore variable state from pipeline_variable
    └── Pipeline.resume(pipelineId)
            │
            └── Block.run() — each block calls loadCompletedIdentifiers()
                    └── Skips actions already marked completed in DB
```

The resume starts from the root block but skips all completed actions, effectively fast-forwarding to the first failed or pending action.

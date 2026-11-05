# Pipelines

The **Pipelines** view shows the execution history of a workflow and lets you inspect, debug, or resume any past run. Every time a workflow executes, Tipeline records the full pipeline — every action, every result, every variable value.

## Pipeline History

Open a workflow, then click the **Pipelines** tab to see all past runs for that workflow.

<div class="screenshot-placeholder" style="height: 280px;">
  <span class="placeholder-icon">📋</span>
  <span class="placeholder-label">Pipeline History List</span>
  <span>Table of all runs — status badge, start time, duration, and a Resume button for failed runs</span>
</div>

Each row shows:

| Column | Description |
|--------|-------------|
| Status | `pending`, `running`, `completed`, `failed`, `canceled`, `paused` |
| Started | When the pipeline began |
| Finished | When it ended (blank if still running) |
| Duration | Elapsed time |

## Pipeline Detail

Click any pipeline to open the full detail view:

<div class="screenshot-placeholder" style="height: 380px;">
  <span class="placeholder-icon">🔍</span>
  <span class="placeholder-label">Pipeline Detail</span>
  <span>Action timeline with status indicators, expandable result panels, and variable state at end of run</span>
</div>

The detail view has three sections:

1. **Action Timeline** — every action in order, with its status, duration, and result. Click any action to expand its result. For structured values (objects, arrays), the result is shown as formatted JSON.
2. **Variables** — the value each variable ended the run with, in a panel next to the timeline. Close it with the **Variables** button (it stays closed for the next run you open); in a narrow window, switch between **Steps** and **Variables** instead. Secret variables, ones from a secret global and ones from the environment are listed by name only — their value is never shown or exported. Connection-like values (browser, database or SSH connections, images) aren't saved, so they show as *Not saved*. While a run is still going, the values are the ones loaded when you opened it; they refresh when the run ends. **Export** includes the variables too.
3. **Error Details** — if the pipeline failed, which action threw and the full error message

### Sub-workflows

A step that runs a sub-workflow (`subtask.exec`) shows the sub-workflow's name, and a
button at the end of its row opens the run it started. Open the row to see the
sub-workflow's steps listed under it. When the sub-workflow failed, the row opens by
itself, down to the step that failed, and the run's **Failed at** names that step. The
**Timing** chart shows the sub-workflow's steps under it too.

- **In a loop**, the step starts one run per pass. Its details show a square per run; the
  steps listed under it are from the failed run, or else the last one.
- **A cached sub-workflow** didn't run. Its button opens the run its outputs came from.
- **Async** (`async: true`) sub-workflows run on their own, so they show up as separate
  runs. They still link back to the run that started them.

A sub-workflow's own run says which run called it (**Called by**), with a link back to that
run and one to the step that started it.

Runs saved before this was added only link a sub-workflow that finished successfully.

### Action Status Indicators

| Status | Meaning |
|--------|---------|
| Completed | Finished successfully |
| Failed | Threw an error |
| Pending | Not yet executed |
| Canceled | The run was canceled (or an approval rejected) while at this step |
| Paused | Execution paused here (debug mode) |

## Resume a Failed Pipeline

If a pipeline has status `failed`, a **Resume** button appears in the history list and in the detail view.

Resuming reloads the original workflow source, restores the variable state at the point of failure, skips all already-completed actions, and continues from the action that failed. You can optionally override variable values before resuming — useful for correcting the input that caused the failure.

## Cancel a Run

A run that's in progress, or waiting for an approval, can be canceled with **Cancel run**
— in the history list, the detail view (and its own window), [Runs](/desktop/overview#runs)
and the Approvals page. After you confirm:

- **A running run** ends right away, including the step running now. Steps after it don't run.
  Sub-workflows it waits for stop with it; ones started with `async: true` are separate runs and
  keep going.
- **A run waiting for an approval** ends right away, and the request is withdrawn.

Either way the run ends as **Canceled**, not failed, and records who canceled it. **Stop**
while debugging works the same way.

On a server workspace, viewers can't cancel runs, and no one can cancel a run of someone
else's private workflow.

## Live Execution View

When a workflow is actively running, the pipeline detail view switches to **live mode**: action statuses update in real time as events stream from the Core engine. You see each action transition from pending → running → completed (or failed) as it happens.

## Debug Mode

Open a workflow in the builder and press **Test Run** to run it in the debugger. The debugger shows the workflow's steps as a list, its variables on the right, and the selected step at the bottom.

**Moving through the run**

- **Run** runs the workflow, stopping only at breakpoints. **Next step** runs it one step at a time.
- The run pauses *before* each step, with that step's input already filled in, so you can check what it's about to do. The header says where you are ("Paused · step 6 of 8").
- **Continue** goes on until the next breakpoint. **Next pass** (inside a loop) runs the rest of the current pass and pauses at the start of the next one.
- **Run this step** and **Skip it** are in the Step tab. A skipped step doesn't run; the run goes on after it.
- Click the dot to the left of a step's number to set a **breakpoint**: the run pauses before that step. Breakpoints are kept for each workflow and can be changed during a run.

**Reading what happened**

- Each row shows what the step did: "200 · 18 items", "pass 3", "failed on pass 7".
- Click a row to see its input, output (as a tree), the variable it saved to, and, for a loop step, every pass.
- The variables column marks what the last step changed (and what it was). Open a variable to see its value, the step that set it and its history. Pin the ones you watch.

**Fixing things without starting over**

- While paused, **Change value** on a variable gives it a new value for the rest of the run.
- **Edit step** opens the step's settings. The change is saved to the workflow, and a run that's still going uses it the next time it gets to that step.
- When a step fails, the run waits at it instead of ending. Edit it and press **Run it again** (for a loop, **Run pass 7 again**), or **Skip it and go on**. Continue, Next step or Stop let the run fail as usual.
- **Open run detail** opens the same run on its run page, in its own window.

**Sub-workflows**

- A step that runs a sub-workflow shows the sub-workflow's name, and its steps are listed
  under it, numbered from the step's number (5.1, 5.2…). Until the step runs, the list
  shows the sub-workflow as saved: dimmed, and folded. Click the name to open it.
- **Next step** on a sub-workflow step goes into it and pauses before its first step.
  **Step over** (⌘O) runs the whole sub-workflow and pauses after it. It works on loops
  and branches too.
- Inside a sub-workflow, **Step out** (⇧⌘O) runs the rest of it and pauses at the next
  step of the workflow that called it. The banner shows where you are, for example
  *Nightly sync › 5 Enrich customer*. Click a name to pick that step.
- Breakpoints work on a sub-workflow's steps too, even before it has run. They're kept
  with the workflow you're debugging.
- While paused in a sub-workflow, the variables column shows the sub-workflow's
  variables, starting from the values it was given, with a switch back to the
  workflow's own. **Change value** works on the level you're paused in.
- When a sub-workflow runs in a loop, its steps show the last run. Only sub-workflows
  named outright show before they run. One chosen by a variable shows once it runs.

## How long runs are kept

Tipeline deletes finished runs after **90 days**, with their steps and values. Change that under
**Settings → Run history**, or turn on **Keep runs forever**. On the command line:

```bash
tipeline pipeline retention         # show the current limit
tipeline pipeline retention 30      # keep runs for 30 days
tipeline pipeline retention off     # keep them forever
```

It checks when Core starts and once a day after that, and again right after you change the limit.

- **Kept whatever their age:** runs still running, runs waiting for an approval, and each workflow's latest run.
- **Deleted for good:** unlike the [Trash](/desktop/trash), a deleted run can't be restored. Past
  approval decisions are stored with their run, so they go too. App tables and charts that read past
  runs only see the runs still kept. To keep any of this longer, raise the limit first.
- **On a Tipeline Server**, only admins can change the limit, and the limit is Core's. The Server's own
  audit log isn't affected.

### Disk space

Space freed by deleting goes back to your disk at the next daily check, instead of staying inside the
database file. A database made by an older version is switched over once the first time Core starts, which
rewrites the file: it takes a moment and briefly needs free disk space about the size of the database.

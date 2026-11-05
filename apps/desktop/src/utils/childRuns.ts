// The runs a run's sub-workflow steps started, attached to those steps so the run page
// can list their steps under the step (Steps and Timing) and link to them.
//
// Core records the run and step that started a sub-workflow run in its metadata
// (`parent`), and the run detail lists them as `children`. Runs from before that only
// have the child run id in the step's result, and only when it succeeded.
import { isSubWorkflowStep, stepChildren } from '@/utils/runSteps';

export interface ChildRun {
  identifier: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  taskIdentifier: string;
  taskName: string | null;
  stepIdentifier: string | null;
}

/** A loaded sub-workflow run: its steps (enriched like the run's own) and its own children. */
export interface ChildRunDetail {
  status: string;
  actions: any[];
  children: ChildRun[];
}

/** The run to show under a step that ran several times (in a loop): a failed one, else the
 *  one running, else the last. */
export function shownChildRun(runs: ChildRun[]): ChildRun | null {
  if (!runs.length) return null;
  const failed = runs.filter((r) => r.status === 'failed').pop();
  const running = runs.filter((r) => r.status === 'running' || r.status === 'paused').pop();
  return failed ?? running ?? runs[runs.length - 1];
}

/** A step's runs from the `children` list, or from its result for runs saved before that. */
function runsOfStep(action: any, children: ChildRun[]): ChildRun[] {
  const listed = children.filter((c) => c.stepIdentifier && c.stepIdentifier === action.identifier);
  if (listed.length) return listed;
  const result = action.result;
  if (result && typeof result === 'object' && result.pipelineIdentifier) {
    return [
      {
        identifier: result.pipelineIdentifier,
        status: action.status ?? 'completed',
        started_at: action.started_at ?? null,
        finished_at: action.finished_at ?? null,
        taskIdentifier: result.taskIdentifier ?? action.params?.identifier ?? '',
        taskName: null,
        stepIdentifier: action.identifier ?? null,
      },
    ];
  }
  return [];
}

/**
 * Sets `childRuns`, `childRun` (the one shown) and `childSteps` (its steps, once loaded) on
 * every sub-workflow step, sub-workflows of sub-workflows included. Returns the runs to
 * load: shown ones without a detail yet, or whose detail is out of date.
 */
export function attachChildRuns(
  actions: any[],
  children: ChildRun[],
  detailOf: (identifier: string) => ChildRunDetail | undefined
): ChildRun[] {
  const missing: ChildRun[] = [];
  const walk = (list: any[], runs: ChildRun[]) => {
    for (const action of list) {
      if (isSubWorkflowStep(action)) {
        const own = runsOfStep(action, runs);
        const shown = shownChildRun(own);
        action.childRuns = own;
        action.childRun = shown;
        const detail = shown ? detailOf(shown.identifier) : undefined;
        action.childSteps = detail?.actions;
        if (shown && (!detail || detail.status !== shown.status)) missing.push(shown);
        if (detail) walk(detail.actions, detail.children);
      } else if (!action.childSteps) {
        walk(stepChildren(action), runs);
      }
    }
  };
  walk(actions ?? [], children ?? []);
  return missing;
}

/**
 * Sub-workflow runs a live run has started so far, from this window's stream: their
 * start events name the run and step that started them. A started run counts as
 * running until its detail is loaded again after it ends.
 */
export function childRunsFromEvents(events: any[], parentPipeline: string): ChildRun[] {
  const runs: ChildRun[] = [];
  for (const event of events) {
    const parent = event.type === 'start' ? event.data?.parent : null;
    if (!parent || parent.pipelineIdentifier !== parentPipeline || !event.pipelineIdentifier) continue;
    runs.push({
      identifier: event.pipelineIdentifier,
      status: 'running',
      started_at: new Date(event.timestamp).toISOString(),
      finished_at: null,
      taskIdentifier: event.taskIdentifier,
      taskName: event.data?.name ?? null,
      stepIdentifier: parent.stepIdentifier ?? null,
    });
  }
  return runs;
}

/** Runs from the saved list, plus live ones it doesn't have yet. */
export function mergeChildRuns(saved: ChildRun[] | undefined, live: ChildRun[]): ChildRun[] {
  const list = [...(saved ?? [])];
  for (const run of live) {
    if (!list.some((r) => r.identifier === run.identifier)) list.push(run);
  }
  return list;
}

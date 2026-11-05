// The debugger's copy of the run's steps, in the shape the run page uses (status,
// params, result, error, iterations, times), built from the debug run's stream events.
// One track for the workflow and one per sub-workflow run it started (keyed 'parent', or
// the sub-workflow run's pipeline identifier). Each sub-workflow run is listed under the
// step that started it (`childSteps`, see runSteps.ts), so the Steps list is one tree;
// a sub-workflow step that hasn't run yet shows the sub-workflow's steps as saved, so a
// breakpoint can be set in it. The step inspector and the variables column read from it.
import { computed, reactive, ref, watch, type Ref } from 'vue';
import type { StreamEvent } from '@/store/stream';
import { updateTimelineWithEvents } from '@/composables/useTimelineUpdater';
import { firstFailed, flattenSteps, isSubWorkflowStep, passCount, runWindow, stepStatus } from '@/utils/runSteps';

export const MAIN_TRACK = 'parent';

export interface DebugTrack {
  key: string;
  taskId: string;
  pipelineId: string | null;
  actions: any[];
  ended: boolean;
  window: { start: number; end: number } | null;
  /** A sub-workflow run: its name, and the run and step that started it. */
  name?: string;
  parent?: SubRun['parent'];
}

/** A sub-workflow run the debug run started (from its start event), and its workflow as saved. */
export interface SubRun {
  pipelineId: string;
  taskId: string;
  name?: string;
  actions: any[];
  /** Its variables as saved, and the values it started with (the props it was given). */
  variables?: any[];
  startValues?: Record<string, unknown>;
  parent?: { pipelineIdentifier: string; stepIdentifier: string } | null;
}

/** A sub-workflow as saved, for a step that hasn't run it yet. */
export interface WorkflowPreview {
  name: string;
  actions: any[];
}

/** A row of the Steps list: whose step it is, its number, and the sub-workflow steps above it. */
export interface DebugRow {
  key: string;
  action: any;
  depth: number;
  /** The track it's in; null for a sub-workflow that hasn't run yet. */
  track: string | null;
  taskId: string;
  /** "5" for the workflow's own steps (the builder's row number), "5.2" inside a sub-workflow. */
  label: string;
  /** Keys of the sub-workflow steps it's inside, outermost first. */
  calls: string[];
}

/** One value a variable took during the debug run, and the step that set it. */
export interface VariableChange {
  value: unknown;
  timestamp: number;
  step: { identifier: string; group?: string; name?: string; comment?: string } | null;
  /** Set by hand in the debugger (Change value), not by a step. */
  manual?: boolean;
}

/** Where the workflow's own run is, for the debugger's header and banner. */
export interface DebugProgress {
  /** waiting: a step failed and the run waits (run it again, skip it, or let it fail). */
  state: 'idle' | 'running' | 'paused' | 'waiting' | 'failed' | 'finished' | 'stopped';
  /** The step it's on (running or next), or the one that failed: its row number (the
   *  builder's), or "5.2" for a step of a sub-workflow. */
  step: { number: number | string; action: any } | null;
  total: number;
  /** The loop or branch around that step, and the pass it's on. */
  around: { action: any; pass: number } | null;
  /** The sub-workflow steps it's inside, outermost first (empty: the workflow's own). */
  calls: Array<{ key: string; action: any; label: string; name: string }>;
  durationMs: number | null;
}

/** Pending steps, without the canvas flags or anything from a run before. Disabled
 *  steps stay, as skipped, so the list matches the workflow (row numbers included). */
function freshSteps(actions: any[], skipped = false): any[] {
  return actions.map((action) => {
    const { finished, error, running, ...step } = action;
    const skip = skipped || !!step.disabled;
    const copy: any = { ...step, status: skip ? 'skipped' : 'pending' };
    if (Array.isArray(step.params?.actions)) {
      copy.params = { ...step.params, actions: freshSteps(step.params.actions, skip) };
    }
    return copy;
  });
}

function flatten(actions: any[]): any[] {
  return actions.flatMap((action) => [
    action,
    ...(Array.isArray(action.params?.actions) ? flatten(action.params.actions) : []),
  ]);
}

function findStep(actions: any[], identifier: string): any | null {
  return flatten(actions).find((action) => action.identifier === identifier) ?? null;
}

const DONE = new Set(['completed', 'failed', 'skipped']);
const started = (action: any) => action.status !== 'pending' && action.status !== 'skipped';

/** Shows a step as running or next for now; clearProgress puts its own status back. */
function mark(action: any, status: string) {
  if (!action._debugMark) action._debugOrig = action.status;
  action._debugMark = true;
  action.status = status;
}

/** Undoes what showProgress and the pause set last time, so the stream's own statuses come first. */
function clearProgress(actions: any[]) {
  for (const action of flatten(actions)) {
    delete action.next;
    delete action.nextParams;
    delete action.nextParamsError;
    delete action.waiting;
    delete action.held;
    if (!action._debugMark) continue;
    action.status = action._debugOrig ?? 'pending';
    delete action._debugMark;
    delete action._debugOrig;
  }
}

/**
 * Where the run is. The stream only says when a step finishes, and the shared updater
 * marks the next top-level step running; inside a loop or a branch that has started,
 * this marks the step it's on.
 */
function showProgress(actions: any[]) {
  for (const action of actions) {
    if (action.status !== 'running') continue;
    const children: any[] = Array.isArray(action.params?.actions) ? action.params.actions : [];
    const inProgress = children.some(started) || (Array.isArray(action.iterations) && action.iterations.length > 0);
    if (!inProgress) continue;
    // Inside it: the first step not run yet, once every step before it is done.
    const child = children.find((c) => !DONE.has(c.status) && c.status !== 'cached');
    if (!child) continue;
    if (child.status === 'pending') mark(child, 'running');
    showProgress([child]);
  }
}

/** The steps from the top down to the one with this identifier (that one last). */
function pathTo(actions: any[], identifier: string): any[] | null {
  for (const action of actions) {
    if (action.identifier === identifier) return [action];
    const children = Array.isArray(action.params?.actions) ? action.params.actions : [];
    const below = children.length ? pathTo(children, identifier) : null;
    if (below) return [action, ...below];
  }
  return null;
}

/**
 * Core paused before a step (or at a failed one) and said which: that step is next,
 * with the input it will run with; the steps around it are running; no other is.
 */
function showPause(actions: any[], paused: StreamEvent) {
  const path = pathTo(actions, paused.data?.identifier);
  if (!path) return;
  const step = path[path.length - 1];
  const around = new Set(path.slice(0, -1));
  for (const action of flatten(actions)) {
    if (action._debugMark && action.status === 'running' && !around.has(action)) {
      action.status = action._debugOrig ?? 'pending';
      delete action._debugMark;
      delete action._debugOrig;
    }
  }
  for (const action of around) {
    if (action.status === 'pending') mark(action, 'running');
  }
  if (paused.data?.failed) {
    step.waiting = true;
    return;
  }
  // Not run yet in this pass (a loop body step may have run in an earlier one).
  if (step.status !== 'pending') mark(step, 'pending');
  step.next = true;
  step.nextParams = paused.data?.params ?? null;
  if (paused.data?.paramsError) step.nextParamsError = paused.data.paramsError;
}

/** While the run waits, the steps still open (a branch, a sub-workflow step) aren't working. */
function holdRunning(actions: any[]) {
  for (const action of flatten(actions)) {
    if (action.status === 'running') action.held = true;
  }
}

/** Once the run is over, a loop or branch whose step failed failed too (the updater
 *  only knows it stopped running). */
function failContainers(actions: any[]): boolean {
  let failed = false;
  for (const action of actions) {
    const children = Array.isArray(action.params?.actions) ? action.params.actions : [];
    const childFailed = children.length > 0 && failContainers(children);
    if (childFailed && action.status !== 'failed' && action._appliedEventTimestamp === undefined) {
      action.status = 'failed';
    }
    if (action.status === 'failed' || childFailed) failed = true;
  }
  return failed;
}

const isEnd = (e: StreamEvent) => e.type === 'end' || e.type === 'end_all' || e.type === 'error';

/** Copies of sub-workflows as saved, one per step that would run them. */
const previewCopies = new WeakMap<object, { from: WorkflowPreview; actions: any[] }>();
// How deep previews of sub-workflows inside sub-workflows go.
const MAX_PREVIEW_DEPTH = 4;
const isTemplate = (value: string) => /\{\{|\{=/.test(value);

/** The name a sub-workflow step shows: the workflow it ran, or will run. */
export function subWorkflowName(action: any): string {
  return action?.childName || action?.params?.identifier || '';
}

export function useDebugTimeline(options: {
  taskId: string;
  source: Ref<any[] | undefined>;
  subtasks: Ref<SubRun[]>;
  events: Ref<StreamEvent[]>;
  isPaused: Ref<boolean>;
  isRunning: Ref<boolean>;
  /** Loads a workflow as saved, for a sub-workflow step that hasn't run yet. */
  loadWorkflow?: (taskId: string) => Promise<WorkflowPreview | null>;
}) {
  const { taskId, source, subtasks, events, isPaused, isRunning, loadWorkflow } = options;

  const tracks = ref<Record<string, DebugTrack>>({});
  // What each list was last built from, and how many events it has seen.
  const builtFrom = new Map<string, unknown>();

  // A step of a track; `key` for a row of a sub-workflow that hasn't run (no track).
  const selected = ref<{ track: string; identifier: string; key?: string } | null>(null);
  // Opened by clicking a step, and by itself when the run pauses or a step fails.
  const inspectorOpen = ref(false);
  // Closed by hand during this run: pausing doesn't reopen it (a failure still does).
  let closedByHand = false;
  let seen = 0;

  const start = computed(() => events.value.find((e) => e.type === 'start'));
  const lastPause = computed(() => {
    for (let i = events.value.length - 1; i >= 0; i--) {
      if (events.value[i].type === 'paused') return events.value[i];
    }
    return null;
  });
  const mainPipeline = computed(() => start.value?.pipelineIdentifier ?? null);

  function eventsOf(track: DebugTrack): StreamEvent[] {
    if (track.key === MAIN_TRACK) {
      return events.value.filter((e) => !e.pipelineIdentifier || e.pipelineIdentifier === track.pipelineId);
    }
    return events.value.filter((e) => e.pipelineIdentifier === track.pipelineId);
  }

  function keyOfPipeline(pipelineId: string | undefined): string | null {
    if (!pipelineId) return null;
    if (pipelineId === mainPipeline.value) return MAIN_TRACK;
    return tracks.value[pipelineId] ? pipelineId : null;
  }

  function build(key: string, taskIdentifier: string, pipelineId: string | null, actions: any[]) {
    tracks.value[key] = {
      key,
      taskId: taskIdentifier,
      pipelineId,
      actions: freshSteps(JSON.parse(JSON.stringify(actions ?? []))),
      ended: false,
      window: null,
    };
  }

  // Sub-workflows as saved, by workflow: loading (undefined while asked), or not found (null).
  const previews = reactive(new Map<string, WorkflowPreview | null>());
  const previewsLoaded = ref(0);
  function requestPreview(id: string) {
    if (!loadWorkflow || previews.has(id)) return;
    previews.set(id, null);
    loadWorkflow(id)
      .then((workflow) => previews.set(id, workflow ?? null))
      .catch(() => previews.set(id, null))
      .finally(() => previewsLoaded.value++);
  }

  /** The step a sub-workflow run was started by: the one its start event names. A run
   *  from an older Core (no parent) goes under a running step that runs its workflow. */
  function ownerStep(track: DebugTrack): any | null {
    if (track.parent) {
      const parentKey = keyOfPipeline(track.parent.pipelineIdentifier);
      const parentTrack = parentKey ? tracks.value[parentKey] : null;
      return parentTrack ? findStep(parentTrack.actions, track.parent.stepIdentifier) : null;
    }
    const candidates = Object.values(tracks.value)
      .filter((t) => t.key !== track.key)
      .flatMap((t) => flatten(t.actions))
      .filter((a) => isSubWorkflowStep(a) && a.params?.identifier === track.taskId);
    return candidates.find((a) => a.status === 'running') ?? candidates[0] ?? null;
  }

  /** Under each sub-workflow step: the run it started (the last one, when it ran in a
   *  loop), or the sub-workflow as saved until it runs. */
  function attach() {
    for (const track of Object.values(tracks.value)) {
      for (const action of flatten(track.actions)) {
        delete action.childSteps;
        delete action.childRunKeys;
        delete action.childTrack;
        delete action.childTask;
        delete action.childName;
        delete action.childPreview;
      }
    }
    const runsByStep = new Map<any, DebugTrack[]>();
    for (const run of subtasks.value) {
      const track = tracks.value[run.pipelineId];
      const step = track && ownerStep(track);
      if (!step) continue;
      runsByStep.set(step, [...(runsByStep.get(step) ?? []), track]);
    }
    for (const [step, runs] of runsByStep) {
      const shown = runs[runs.length - 1];
      step.childRunKeys = runs.map((run) => ({ key: run.key, pipelineId: run.pipelineId, ended: run.ended }));
      step.childTrack = shown.key;
      step.childTask = shown.taskId;
      step.childName = shown.name;
      step.childSteps = shown.actions;
    }
    const main = tracks.value[MAIN_TRACK];
    if (main) preview(main.actions, [taskId], 0);
    for (const run of subtasks.value) {
      const track = tracks.value[run.pipelineId];
      if (track) preview(track.actions, [taskId, track.taskId], 1);
    }
  }

  function preview(actions: any[], chain: string[], depth: number) {
    for (const step of flatten(actions)) {
      if (!isSubWorkflowStep(step) || step.childTrack) continue;
      const id = step.params?.identifier;
      // Only a sub-workflow named outright (not by a variable), and never one already above.
      if (typeof id !== 'string' || !id || isTemplate(id) || chain.includes(id) || depth >= MAX_PREVIEW_DEPTH) continue;
      if (!previews.has(id)) requestPreview(id);
      const workflow = previews.get(id);
      if (!workflow) continue;
      let copy = previewCopies.get(step);
      if (!copy || copy.from !== workflow) {
        copy = { from: workflow, actions: freshSteps(JSON.parse(JSON.stringify(workflow.actions ?? []))) };
        previewCopies.set(step, copy);
      }
      step.childSteps = copy.actions;
      step.childTask = id;
      step.childName = workflow.name;
      step.childPreview = true;
      preview(copy.actions, [...chain, id], depth + 1);
    }
  }

  function reset() {
    tracks.value = {};
    builtFrom.clear();
    selected.value = null;
    inspectorOpen.value = false;
    closedByHand = false;
    seen = 0;
  }

  function apply() {
    // A new run (events cleared, or another start) starts again from the workflow.
    if (events.value.length < seen || builtFrom.get(MAIN_TRACK) !== (start.value ?? source.value)) {
      reset();
      build(MAIN_TRACK, taskId, mainPipeline.value, source.value ?? []);
      builtFrom.set(MAIN_TRACK, start.value ?? source.value);
    }
    // A sub-workflow's list, once its steps have loaded.
    for (const tab of subtasks.value) {
      if (tab.actions.length && builtFrom.get(tab.pipelineId) !== tab.actions) {
        build(tab.pipelineId, tab.taskId, tab.pipelineId, tab.actions);
        builtFrom.set(tab.pipelineId, tab.actions);
      }
      const track = tracks.value[tab.pipelineId];
      if (track) {
        track.name = tab.name;
        track.parent = tab.parent ?? null;
      }
    }

    // Core says which step it waits at, and in which run (the workflow or a sub-workflow).
    const pause = isPaused.value ? lastPause.value : null;
    const pausedKey = pause ? (keyOfPipeline(pause.pipelineIdentifier) ?? MAIN_TRACK) : null;

    for (const track of Object.values(tracks.value)) {
      const own = eventsOf(track);
      clearProgress(track.actions);
      if (track.pipelineId) updateTimelineWithEvents(track.actions, own);
      // Which variable each step saved its output to ("→ saved to orders").
      for (const event of own) {
        if (event.type !== 'action' || !event.data?.destination) continue;
        const step = findStep(track.actions, event.data.identifier);
        if (step) step.destination = event.data.destination;
      }
      const end = own.find(isEnd);
      track.ended = !!end;
      if (end) failContainers(track.actions);
      else {
        showProgress(track.actions);
        if (pause && track.key === pausedKey) showPause(track.actions, pause);
        if (pause) holdRunning(track.actions);
      }
      const begin = own.find((e) => e.type === 'start');
      track.window = runWindow(
        track.actions,
        {
          started_at: begin ? new Date(begin.timestamp).toISOString() : null,
          finished_at: end ? new Date(end.timestamp).toISOString() : null,
        },
        null
      );
    }

    // Follow the run: the step that just finished, or the one that failed.
    for (const event of events.value.slice(seen)) {
      const key = keyOfPipeline(event.pipelineIdentifier);
      const identifier = event.data?.identifier;
      if (!key || !identifier) continue;
      if (event.type === 'action') selected.value = { track: key, identifier };
      if (event.type === 'action_error') {
        selected.value = { track: key, identifier };
        inspectorOpen.value = true;
      }
    }
    seen = events.value.length;
    if (isPaused.value && selected.value && !closedByHand) inspectorOpen.value = true;
    attach();
  }

  // Events are pushed onto the same array (and the array replaced for a new run).
  watch(
    () => [
      events.value.length,
      isPaused.value,
      source.value,
      subtasks.value.map((t) => [t.actions, t.name, t.parent]),
      previewsLoaded.value,
    ],
    apply,
    { immediate: true }
  );

  /** Every value each variable of a run took, oldest first (not its starting value). */
  function historyOf(track: DebugTrack | undefined, pipelineId: string | null) {
    const history: Record<string, VariableChange[]> = {};
    for (const event of events.value) {
      const own = event.pipelineIdentifier === pipelineId;
      // A step's changes, or a value set by hand while paused (Change value).
      const manual = event.type === 'paused';
      if (!own || (event.type !== 'action' && !manual)) continue;
      const step = !manual && track ? findStep(track.actions, event.data?.identifier) : null;
      for (const change of event.data?.changedVariables ?? []) {
        (history[change.name] ??= []).push({
          value: change.value,
          timestamp: event.timestamp,
          step: step
            ? { identifier: step.identifier, group: step.group, name: step.name, comment: step.comment }
            : null,
          ...(manual ? { manual: true } : {}),
        });
      }
    }
    return history;
  }

  /** The variables a run's last step changed. */
  function lastChangedOf(pipelineId: string | null) {
    const own = events.value.filter((e) => e.type === 'action' && e.pipelineIdentifier === pipelineId);
    const last = own[own.length - 1];
    return new Set<string>((last?.data?.changedVariables ?? []).map((c: any) => c.name));
  }

  /** Every value each workflow variable took, oldest first (not its starting value). */
  const variableHistory = computed(() => historyOf(tracks.value[MAIN_TRACK], mainPipeline.value));

  /** The variables the last step changed. */
  const lastChanged = computed(() => lastChangedOf(mainPipeline.value));

  /**
   * A sub-workflow run's variables, for the variables column: as saved, with the values
   * it started with and every change since (the workflow's own come from the builder).
   */
  function subVariables(key: string) {
    const track = tracks.value[key];
    const run = subtasks.value.find((r) => r.pipelineId === key);
    if (!track || !run) return null;
    const initial: Record<string, unknown> = {
      ...Object.fromEntries((run.variables ?? []).map((v: any) => [v.name, v.value])),
      ...(run.startValues ?? {}),
    };
    const history = historyOf(track, track.pipelineId);
    const variables = (run.variables ?? []).map((v: any) => {
      const changes = history[v.name] ?? [];
      return { ...v, value: changes.length ? changes[changes.length - 1].value : initial[v.name] };
    });
    return { name: track.name ?? track.taskId, variables, initial, history, lastChanged: lastChangedOf(track.pipelineId) };
  }

  /**
   * Every row of the Steps list (the workflow's steps, each sub-workflow's under the step
   * that runs it), with its track and number. The workflow's own rows keep the builder's
   * numbers; a sub-workflow's are numbered under its step ("5.1", "5.2").
   */
  const rows = computed<DebugRow[]>(() => {
    const main = tracks.value[MAIN_TRACK];
    if (!main) return [];
    const byKey = new Map<string, DebugRow>();
    const counters = new Map<string, number>();
    const list: DebugRow[] = [];
    for (const row of flattenSteps(main.actions)) {
      const cut = row.key.lastIndexOf('>');
      const scope = cut >= 0 ? row.key.slice(0, cut) : '';
      const above = scope ? byKey.get(scope) : null;
      const count = (counters.get(scope) ?? 0) + 1;
      counters.set(scope, count);
      const info: DebugRow = {
        key: row.key,
        action: row.action,
        depth: row.depth,
        track: above ? (above.action.childTrack ?? null) : MAIN_TRACK,
        taskId: above ? above.action.childTask : taskId,
        label: above ? `${above.label}.${count}` : String(count),
        calls: above ? [...above.calls, scope] : [],
      };
      byKey.set(row.key, info);
      list.push(info);
    }
    return list;
  });
  const rowByKey = computed(() => new Map(rows.value.map((row) => [row.key, row])));

  /** The breakpoint for a row: the workflow's own steps by identifier, a sub-workflow's
   *  as `workflow:step` (Core takes both). */
  function breakpointOf(key: string): string | null {
    const row = rowByKey.value.get(key);
    if (!row?.action.identifier) return null;
    return row.track === MAIN_TRACK ? row.action.identifier : `${row.taskId}:${row.action.identifier}`;
  }

  const progress = computed<DebugProgress>(() => {
    const main = tracks.value[MAIN_TRACK];
    const all = rows.value;
    // Failed: one of the workflow's own steps (a sub-workflow step fails with its run).
    const ownFailed = main
      ? flattenSteps(main.actions, (_key, step) => !step.childSteps).filter((r) => stepStatus(r.action) === 'failed').pop()
      : undefined;
    const failed = ownFailed ?? null;
    const ended = !!main?.ended;
    const state: DebugProgress['state'] = !start.value
      ? 'idle'
      : isPaused.value && lastPause.value?.data?.failed
        ? 'waiting'
        : failed || (ended && events.value.some((e) => e.type === 'error'))
        ? 'failed'
        : ended
          ? 'finished'
          : isPaused.value
            ? 'paused'
            : isRunning.value
              ? 'running'
              : 'stopped';
    // The deepest step that's running or next (a loop is running while a step in it is,
    // a sub-workflow step while a step of its run is). Where it waits, when paused.
    let at = -1;
    all.forEach((row, i) => {
      if (row.track !== null && (row.action.next || row.action.waiting || row.action.status === 'running')) at = i;
    });
    // The step that failed, inside the sub-workflow when it was a sub-workflow step.
    if (failed) {
      const deepest = firstFailed([failed.action]) ?? failed;
      at = all.findIndex((row) => row.action === deepest.action);
    }
    const current = at >= 0 ? all[at] : null;
    // The loop or branch it's in: the nearest row above it, one level up, in the same workflow.
    let around: DebugProgress['around'] = null;
    if (current && current.depth > 0) {
      for (let i = at - 1; i >= 0; i--) {
        const row = all[i];
        if (row.depth !== current.depth - 1) continue;
        if (Array.isArray(row.action.params?.actions) && row.action.params.actions.length) {
          around = { action: row.action, pass: Math.max(1, passCount(row.action)) };
        }
        break;
      }
    }
    const calls = (current?.calls ?? []).map((key) => {
      const row = rowByKey.value.get(key)!;
      return { key, action: row.action, label: row.label, name: subWorkflowName(row.action) };
    });
    const span = main?.window;
    return {
      state,
      step: current
        ? { number: current.calls.length ? current.label : Number(current.label), action: current.action }
        : null,
      total: all.filter((row) => row.track === MAIN_TRACK).length,
      around,
      calls,
      durationMs: span ? span.end - span.start : null,
    };
  });

  /** Where a paused run waits: the track (the workflow's, or a sub-workflow run's). */
  const pausedTrack = computed(() => {
    if (!isPaused.value || !lastPause.value) return null;
    return keyOfPipeline(lastPause.value.pipelineIdentifier) ?? MAIN_TRACK;
  });

  const selectedStep = computed(() => {
    if (selected.value?.key) return rowByKey.value.get(selected.value.key)?.action ?? null;
    const track = selected.value && tracks.value[selected.value.track];
    return track ? findStep(track.actions, selected.value!.identifier) : null;
  });
  const selectedTrack = computed(() => (selected.value ? tracks.value[selected.value.track] ?? null : null));
  /** The picked row of the Steps list. */
  const selectedKey = computed(() => {
    if (selected.value?.key) return selected.value.key;
    const step = selectedStep.value;
    return step ? (rows.value.find((row) => row.action === step)?.key ?? null) : null;
  });

  function select(track: string, identifier: string) {
    const list = tracks.value[track];
    if (!list || !findStep(list.actions, identifier)) return;
    selected.value = { track, identifier };
    inspectorOpen.value = true;
  }

  /** Picks a row of the Steps list: a step of a run, or of a sub-workflow that hasn't run yet. */
  function selectKey(key: string) {
    const row = rowByKey.value.get(key);
    if (!row) return;
    if (row.track && row.action.identifier) {
      select(row.track, row.action.identifier);
      return;
    }
    selected.value = { track: '', identifier: row.action.identifier ?? '', key };
    inspectorOpen.value = true;
  }

  function openInspector() {
    inspectorOpen.value = true;
  }

  function closeInspector() {
    inspectorOpen.value = false;
    closedByHand = true;
  }

  return {
    tracks,
    rows,
    rowByKey,
    breakpointOf,
    selected,
    selectedStep,
    selectedTrack,
    selectedKey,
    pausedTrack,
    subVariables,
    inspectorOpen,
    select,
    selectKey,
    openInspector,
    closeInspector,
    variableHistory,
    lastChanged,
    progress,
  };
}

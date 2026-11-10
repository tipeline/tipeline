<script setup lang="ts">
interface Task {
  id: string;
  name: string;
  description?: string;
  status?: string;
  source?: string;
  [key: string]: any;
}
import { ref, computed, watch, provide, nextTick } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useLocalStorage } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { getAllValidations, getGroupMeta } from '@tipeline/schemas';
import { useQuery } from '@/composables/useQuery';
import { useTaskSource } from '@/composables/useTaskSource';
import DraftBanner from '@/components/task/DraftBanner.vue';
import { useSaveTask } from '@/composables/useSaveTask';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { useTaskStore } from '@/store/task';
import { useRecentItemsStore } from '@/store/recentItems';
import { usePluginStore } from '@/store/pluginStore';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import TaskActionsLibrary from '@/components/task/TaskActionsLibrary.vue';
import TaskPipelineCanvas from '@/components/task/TaskPipelineCanvas.vue';
import TaskPipelineCanvasSkeleton from '@/components/task/TaskPipelineCanvasSkeleton.vue';
import TaskCodeEditor from '@/components/task/TaskCodeEditor.vue';
import TaskVariablesPanel from '@/components/task/TaskVariablesPanel.vue';
import TaskVariablesPanelSkeleton from '@/components/task/TaskVariablesPanelSkeleton.vue';
import TaskPipelineControls from '@/components/task/TaskPipelineControls.vue';
import TaskPipelineDebugControls from '@/components/task/TaskPipelineDebugControls.vue';
import TaskDebugFooter from '@/components/task/TaskDebugFooter.vue';
import TaskDialogActionEdit from '@/components/task/TaskDialogActionEdit.vue';
import DebugStepInspector from '@/components/task/DebugStepInspector.vue';
import DebugStepList from '@/components/task/DebugStepList.vue';
import DebugVariablesPanel from '@/components/task/DebugVariablesPanel.vue';
import RunStepsSkeleton from '@/components/run/RunStepsSkeleton.vue';
import { MAIN_TRACK, useDebugTimeline, type DebugTrack } from '@/composables/useDebugTimeline';
import { formatStepDuration, isSubWorkflowStep, stepStatus } from '@/utils/runSteps';
import { generateIdentifier } from '@tipeline/utils';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import TaskGoToRowModal from '@/components/task/TaskGoToRowModal.vue';
import { countTotalRows, findIdentifierByRowNumber } from '@/utils/rowNumbering';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
} from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useIcon } from '@/composables/useIcon';
import { useActionT } from '@/composables/useActionT';
import { hasFlowOrderingErrors, hasFlowFieldErrors } from '@/utils/flowValidation';
import AssistantButton from '@/components/agent/AssistantButton.vue';

const { getIconComponent } = useIcon();
const { tGroup, tAction, tActionDescription } = useActionT();
const router = useRouter();
const taskStore = useTaskStore();
const pluginStore = usePluginStore();
const route = useRoute();
const { t } = useI18n();
const identifier = route.params.tid as string;
const { data: task } = useQuery<Task>(SEND.TASK_DETAIL, { identifier });
const { data: globalVariables, refetch: refetchGlobalVariables } = useQuery<any[]>(SEND.VARIABLE_LIST);

const {
  parsedSource,
  parsedSourceDebug,
  isDebug,
  debugCacheMode,
  hasCachedSteps,
  isPaused,
  isRunning,
  savedIndicator,
  activeVariables,
  executionEvents,
  subtaskTabs,
  viewMode,
  codeText,
  codeErrors,
  enterCodeView,
  applyAndSaveCodeView,
  cancelCodeView,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRun,
  onNext,
  onPause,
  onStop,
  onExit,
  onDebug,
  breakpoints,
  toggleBreakpoint,
  onSkip,
  onNextPass,
  onStepOver,
  onStepOut,
  onRetry,
  sendStepUpdate,
  setDebugVariable,
} = useTaskSource(identifier, task);

// Trail of tasks above this one, populated when we arrived here via
// "Open subtask builder" from an ancestor's action modal.
interface AncestorEntry {
  identifier: string;
  name: string;
}

function parseChain(raw: unknown): AncestorEntry[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const ancestorChain = ref<AncestorEntry[]>(parseChain(route.query.chain));

const breadcrumbChain = computed<AncestorEntry[]>(() => [
  ...ancestorChain.value,
  { identifier, name: task.value?.name ?? '' },
]);

// Every level of subtask drill-down is exactly one router.push (see
// navigateToSubtask below), so an ancestor N levels up is always exactly N
// entries back in *real* browser history. Walking there with router.go
// (rather than pushing a fresh route) means we land on that entry's actual
// history record — openAction included — instead of piling up new forward
// entries that make the back arrow's "go back one step" desync from what the
// user thinks of as "back".
function jumpTo(entry: AncestorEntry) {
  const index = ancestorChain.value.findIndex((a) => a.identifier === entry.identifier);
  if (index === -1) return;
  const stepsBack = breadcrumbChain.value.length - 1 - index;
  router.go(-stepsBack);
}

// Provided to the (possibly deeply nested) action-edit dialog so it can jump
// straight into a subtask's own builder without threading an emit through
// every intermediate TaskPipelineCanvas level.
async function navigateToSubtask(childIdentifier: string, returnActionId: string) {
  // Awaited: firing the push before this replace has actually committed can
  // make Vue Router abandon the replace mid-flight, so the parent's history
  // entry never ends up tagged with openAction.
  await router.replace({ query: { ...route.query, openAction: returnActionId } });
  const nextChain = [...ancestorChain.value, { identifier, name: task.value?.name ?? '' }];
  router.push({
    name: 'TaskEdit',
    params: { tid: childIdentifier },
    query: { chain: JSON.stringify(nextChain) },
  });
}

provide('navigateToSubtask', navigateToSubtask);

// Same drill-down as navigateToSubtask, but used when the user jumps to a
// subtask straight from its action row (no modal was ever opened) — so
// unlike navigateToSubtask, this must NOT tag the current entry with
// openAction, otherwise "back" would pop open a modal the user never opened.
function navigateToSubtaskDirect(childIdentifier: string) {
  const nextChain = [...ancestorChain.value, { identifier, name: task.value?.name ?? '' }];
  router.push({
    name: 'TaskEdit',
    params: { tid: childIdentifier },
    query: { chain: JSON.stringify(nextChain) },
  });
}

provide('navigateToSubtaskDirect', navigateToSubtaskDirect);

// Consumed by TaskPipelineCanvas: the identifier of the action whose modal
// should reopen once its owning canvas mounts. Cleared (and stripped from the
// URL) once claimed, so a page refresh doesn't re-trigger it.
const pendingOpenActionId = ref<string | undefined>(
  typeof route.query.openAction === 'string' ? route.query.openAction : undefined
);
provide('pendingOpenActionId', pendingOpenActionId);
// Set alongside pendingOpenActionId for a step that was just added from the actions
// library, so its dialog opens as a new step (cancel removes it) like a dropped one.
const pendingNewActionId = ref<string | undefined>();
provide('pendingNewActionId', pendingNewActionId);

// Workflow names by identifier, so a sub-workflow row on the canvas can say which
// workflow it runs. Reloaded after a step is saved, in case a new one was picked.
const { data: workflowList, refetch: refetchWorkflowNames } =
  useQuery<Array<{ identifier: string; name: string }>>(SEND.TASK_LIST);
const workflowNames = computed(
  () => new Map((workflowList.value ?? []).map((w) => [w.identifier, w.name] as [string, string]))
);
provide('workflowNames', workflowNames);
provide('refreshWorkflowNames', () => refetchWorkflowNames());

// The debug run's steps with their input, output and errors — the workflow's, and each
// sub-workflow's under the step that runs it — for the step list and the inspector.
const debugTimeline = useDebugTimeline({
  taskId: identifier,
  source: computed(() => parsedSourceDebug.value?.pipeline?.actions),
  subtasks: subtaskTabs,
  events: executionEvents,
  isPaused,
  isRunning,
  // A sub-workflow step that hasn't run yet lists the sub-workflow as saved.
  loadWorkflow: async (taskId) => {
    const result = await window.ipcRenderer.invoke(SEND.TASK_DETAIL, {
      correlationId: generateIdentifier(),
      payload: { identifier: taskId },
    });
    if (!result?.source) return null;
    return { name: result.name ?? taskId, actions: JSON.parse(result.source)?.pipeline?.actions ?? [] };
  },
});
const debugTracks = debugTimeline.tracks;
const debugSelection = debugTimeline.selected;
const debugSelectedStep = debugTimeline.selectedStep;
const debugSelectedTrack = debugTimeline.selectedTrack;
// The bottom panel shows the picked step (opened by a click, a pause or a failure), or
// the raw log. Picking Log by hand keeps pauses from switching back; a failure still does.
const debugBottomTab = computed<'step' | 'log'>({
  get: () => (debugTimeline.inspectorOpen.value ? 'step' : 'log'),
  set: (tab) => (tab === 'step' ? debugTimeline.openInspector() : debugTimeline.closeInspector()),
});
const showDebugVariables = useLocalStorage('tipeline:debugger:showVariables', true);
// What each variable started the run with: the builder's values.
const debugInitialValues = computed<Record<string, unknown>>(() =>
  Object.fromEntries((parsedSource.value?.pipeline?.variables ?? []).map((v: any) => [v.name, v.value]))
);

// Where the run is, in the header ("Paused · step 6 of 8 · 1.9s") and above the steps.
const debugProgress = debugTimeline.progress;
const debugStatusText = computed(() => {
  const p = debugProgress.value;
  const parts = [t(`debugStatus.${p.state}`)];
  if (p.step && p.state === 'failed') parts[0] = t('debugStatus.failedAt', { step: p.step.number });
  else if (p.step && p.state === 'waiting') parts[0] = t('debugStatus.waitingAt', { step: p.step.number });
  else if (p.step && (p.state === 'running' || p.state === 'paused')) {
    parts.push(t('debugStatus.step', { step: p.step.number, total: p.total }));
  }
  if (p.durationMs !== null && p.state !== 'idle') parts.push(formatStepDuration(p.durationMs));
  return parts.join(' · ');
});
const debugStepTitle = (action: any) => action.comment || tAction(action.group, action.name);
const debugBanner = computed(() => {
  const p = debugProgress.value;
  if (!p.step) return null;
  // Inside a sub-workflow: the workflow, then each sub-workflow step down to this one.
  const calls = p.calls.length
    ? [
        { key: null as string | null, name: task.value?.name ?? identifier },
        ...p.calls.map((call) => ({ key: call.key as string | null, name: `${call.label} ${call.name}` })),
      ]
    : [];
  if (p.state === 'paused' && p.step.action.next) {
    return {
      tone: 'paused',
      title: t('debugStatus.pausedBefore', { step: debugStepTitle(p.step.action) }),
      detail: p.around ? t('debugStatus.inPass', { step: debugStepTitle(p.around.action), pass: p.around.pass }) : '',
      calls,
    };
  }
  if (p.state === 'failed' || p.state === 'waiting') {
    const error = p.step.action.error;
    const text = typeof error === 'string' ? error : (error?.message ?? '');
    return {
      tone: 'failed',
      title: t('debugStatus.failedStep', { step: debugStepTitle(p.step.action) }),
      detail: text.split('\n')[0],
      // The run waits: what can be done (in the Step tab).
      hint: p.state === 'waiting' ? t('debugStatus.waitingHint') : '',
      calls,
    };
  }
  return null;
});

// Paused before a step inside a loop or branch: "Next pass" runs the rest of it.
const canNextPass = computed(
  () => isPaused.value && debugProgress.value.state === 'paused' && !!debugProgress.value.around
);
// Paused before a step that runs others (a sub-workflow, a loop, a branch): "Step over"
// runs it to its end. Inside a sub-workflow: "Step out" runs the rest of it.
const canStepOver = computed(() => {
  const step = debugProgress.value.step?.action;
  return (
    isPaused.value &&
    debugProgress.value.state === 'paused' &&
    !!step?.next &&
    (isSubWorkflowStep(step) || (Array.isArray(step.params?.actions) && step.params.actions.length > 0))
  );
});
const canStepOut = computed(
  () =>
    isPaused.value &&
    debugProgress.value.state === 'paused' &&
    !!debugTimeline.pausedTrack.value &&
    debugTimeline.pausedTrack.value !== MAIN_TRACK
);

// The Steps list's numbers, and its rows with a breakpoint (a sub-workflow's steps keep
// theirs as `workflow:step`).
const debugLabels = computed(() => Object.fromEntries(debugTimeline.rows.value.map((row) => [row.key, row.label])));
const breakpointRows = computed(() =>
  debugTimeline.rows.value
    .filter((row) => {
      const id = debugTimeline.breakpointOf(row.key);
      return !!id && breakpoints.value.includes(id);
    })
    .map((row) => row.key)
);
function toggleRowBreakpoint(key: string) {
  const id = debugTimeline.breakpointOf(key);
  if (id) toggleBreakpoint(id);
}

// The variables column: the workflow's, or while paused inside a sub-workflow (or with
// one of its steps picked), that sub-workflow's — with a switch back to the workflow's.
const variablesOfWorkflow = ref(false);
const subVariablesKey = computed(() => {
  const paused = debugTimeline.pausedTrack.value;
  if (paused && paused !== MAIN_TRACK) return paused;
  const picked = debugSelection.value?.track;
  return picked && picked !== MAIN_TRACK && debugTracks.value[picked] ? picked : null;
});
watch(subVariablesKey, () => (variablesOfWorkflow.value = false));
const shownSubVariables = computed(() =>
  subVariablesKey.value && !variablesOfWorkflow.value ? debugTimeline.subVariables(subVariablesKey.value) : null
);

// The workflow's own step as saved (the debugger shows a copy made at the start of the
// run): what Edit step opens, and what the Step tab compares its filled-in input with.
function sourceStep(stepIdentifier: string | undefined): any | null {
  if (!stepIdentifier) return null;
  const walk = (list: any[]): any => {
    for (const step of list ?? []) {
      if (step.identifier === stepIdentifier) return step;
      const found = Array.isArray(step.params?.actions) ? walk(step.params.actions) : null;
      if (found) return found;
    }
    return null;
  };
  return walk(parsedSource.value?.pipeline?.actions ?? []);
}
const selectedIsOwn = computed(() => debugSelection.value?.track === MAIN_TRACK);
const selectedSourceStep = computed(() =>
  selectedIsOwn.value ? sourceStep(debugSelection.value?.identifier) : null
);

// Edit step only where the change can still matter: the step the run waits at, one it
// hasn't run yet, one in a loop that's still going (later passes run it again), or the
// failed step of a run that's over (fix it, then run again). A finished step can't be
// gone back to, so editing it there would change nothing.
const canEditSelected = computed(() => {
  const step = debugSelectedStep.value;
  if (!step || !selectedSourceStep.value) return false;
  if (step.next || step.waiting) return true;
  const track = debugTracks.value[MAIN_TRACK];
  if (!track || track.ended || (!isRunning.value && !isPaused.value)) {
    return stepStatus(step) === 'failed';
  }
  if (stepStatus(step) === 'pending') return true;
  return insideRunningLoop(track.actions, step.identifier);
});
function insideRunningLoop(actions: any[], stepIdentifier: string, inLoop = false): boolean {
  for (const action of actions ?? []) {
    if (action.identifier === stepIdentifier) return inLoop;
    const children = action.params?.actions;
    if (Array.isArray(children)) {
      const loop = inLoop || (action.status === 'running' && /loop/i.test(action.name ?? ''));
      if (insideRunningLoop(children, stepIdentifier, loop)) return true;
    }
  }
  return false;
}

// Edit step: the builder's step editor, on the saved workflow. The change is saved like
// any edit, and a run still going uses it the next time it gets to that step.
const editingStep = ref<any>(null);
const editStepOpen = ref(false);
function openStepEditor() {
  const step = selectedSourceStep.value;
  if (!step) return;
  editingStep.value = step;
  editStepOpen.value = true;
}
function onStepEdited() {
  const step = editingStep.value;
  if (!step) return;
  markDirty();
  const used = sendStepUpdate({
    identifier: step.identifier,
    params: JSON.parse(JSON.stringify(step.params ?? {})),
    destination: step.destination ?? '',
  });
  toast.success(used ? t('debugInspector.editedLive') : t('debugInspector.edited'));
}

// Core couldn't use a value given in Change value: say why.
watch(
  () => executionEvents.value[executionEvents.value.length - 1],
  (event) => {
    const problem = event?.type === 'paused' ? event.data?.variableError : null;
    if (problem) toast.error(t('debugVariables.notUsed', { name: problem.name, error: problem.message }));
  }
);

// Debug runs are saved like any other: open one on the run page, in its own window so
// the debugger stays where it is.
function openDebugRun(track: DebugTrack | null | undefined) {
  if (!track?.pipelineId) return;
  openInWindow(windowPaths.run(track.taskId, track.pipelineId), t('runWindow.title', { id: track.pipelineId }));
}

watch(pendingOpenActionId, (value) => {
  if (value !== undefined) return;
  if (!('openAction' in route.query)) return;
  const { openAction: _openAction, ...rest } = route.query;
  router.replace({ query: rest });
});

const hasOrderingErrors = computed(() => {
  const actions = parsedSource.value?.pipeline?.actions ?? [];
  return hasFlowOrderingErrors(actions) || hasFlowFieldErrors(actions, pluginStore.pluginParams, pluginStore.pluginRules);
});

const actionsLibraryRef = ref<{ focusSearch: () => void } | null>(null);
const canEditVisualMode = computed(() => !isDebug.value && viewMode.value === 'visual');
const canEditCodeMode = computed(() => !isDebug.value && viewMode.value === 'code');
const { isDirty, markDirty } = useSaveTask();

// "Go to Row" (Ctrl/Cmd+G): jumps straight to a row by its number in the
// canvas's flattened gutter, the same way clicking it would — opens its
// action modal and scrolls it to the top of the canvas viewport.
const showGoToRow = ref(false);
const totalRows = computed(() => countTotalRows(parsedSource.value?.pipeline?.actions ?? []));

// Reka UI's Dialog keeps its focus trap's document-level listeners active for
// as long as it's mounted — including during its ~200ms close animation
// (DialogContent's `duration-200`). Opening the action-edit dialog before the
// Go-to-Row dialog finishes unmounting makes the two focus traps fight over
// focus, and the new dialog reads the resulting focus loss as an outside
// interaction and immediately dismisses itself. Waiting out the close
// animation avoids the overlap entirely.
const DIALOG_CLOSE_ANIMATION_MS = 220;

function onGoToRowSubmit(row: number) {
  const actions = parsedSource.value?.pipeline?.actions ?? [];
  const identifier = findIdentifierByRowNumber(actions, row);
  if (!identifier) {
    toast(t('tasks.builder.canvas.goToRow.notFound'));
    return;
  }
  // The debugger's list has the same rows (disabled ones too): pick it for the inspector.
  if (isDebug.value) {
    debugTimeline.select(MAIN_TRACK, identifier);
    return;
  }
  setTimeout(() => {
    // TaskPipelineCanvas watches this and opens the matching row's action
    // modal wherever it lives in the (possibly nested) tree.
    pendingOpenActionId.value = identifier;
    nextTick(() => {
      document.querySelector(`[data-id="${identifier}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, DIALOG_CLOSE_ANIMATION_MS);
}

// Mirrors the idle/running/paused split TaskPipelineDebugControls uses to
// decide which of its buttons are enabled, so these shortcuts stay in sync
// with what's actually clickable.
const debugRunning = computed(() => isDebug.value && isRunning.value && !isPaused.value);
const debugIdle = computed(() => isDebug.value && !isRunning.value && !isPaused.value);

useKeyboardShortcuts([
  {
    // Not skipWhenEditable: Cmd+S should save even while a param field has
    // focus, same as other editors — unlike Cmd+E/Cmd+F it has no conflicting
    // native text-field binding to avoid.
    key: 's',
    meta: true,
    enabled: computed(() => canEditVisualMode.value && isDirty.value),
    handler: () => onSave(),
  },
  {
    // Debug mode's Stop, sharing the key with Save above — the two modes
    // are mutually exclusive so only one is ever enabled at a time.
    key: 's',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && !debugIdle.value),
    handler: () => onStop(),
  },
  {
    // Code view's Save. Also not skipWhenEditable: the CodeMirror editor is
    // a contenteditable surface, so this is the whole point of the mode —
    // saving needs to work while focus is inside it.
    key: 's',
    meta: true,
    enabled: canEditCodeMode,
    handler: () => { applyAndSaveCodeView(); },
  },
  {
    // Code view's Discard, sharing the key with debug mode's Exit below —
    // again mutually exclusive modes, never both enabled at once.
    key: 'Escape',
    enabled: canEditCodeMode,
    handler: () => cancelCodeView(),
  },
  {
    // skipWhenEditable: inside a field (or the YAML editor) ⌘Z undoes typing. Off
    // while a dialog is open, so it never changes the canvas behind it.
    key: 'z',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => canEditVisualMode.value && canUndo.value),
    handler: () => {
      if (!document.querySelector('[role="dialog"]')) onUndo();
    },
  },
  {
    key: 'z',
    meta: true,
    shift: true,
    skipWhenEditable: true,
    enabled: computed(() => canEditVisualMode.value && canRedo.value),
    handler: () => {
      if (!document.querySelector('[role="dialog"]')) onRedo();
    },
  },
  {
    key: 'f',
    meta: true,
    skipWhenEditable: true,
    enabled: canEditVisualMode,
    handler: () => actionsLibraryRef.value?.focusSearch(),
  },
  {
    key: 'e',
    meta: true,
    skipWhenEditable: true,
    enabled: canEditVisualMode,
    handler: () => enterCodeView(),
  },
  {
    // Not skipWhenEditable: VS Code's own Ctrl+G "Go to Line" works while
    // typing too, and there's no conflicting native text-field binding to avoid.
    key: 'g',
    meta: true,
    // In the debugger it picks the row in the step list.
    enabled: computed(() => canEditVisualMode.value || isDebug.value),
    handler: () => { showGoToRow.value = true; },
  },
  {
    key: 'n',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && !debugRunning.value && !hasOrderingErrors.value),
    handler: () => onNext(),
  },
  {
    key: 'n',
    meta: true,
    shift: true,
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && canNextPass.value),
    handler: () => onNextPass(),
  },
  {
    key: 'o',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && canStepOver.value),
    handler: () => onStepOver(),
  },
  {
    key: 'o',
    meta: true,
    shift: true,
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && canStepOut.value),
    handler: () => onStepOut(),
  },
  {
    key: 'p',
    meta: true,
    skipWhenEditable: true,
    enabled: debugRunning,
    handler: () => onPause(),
  },
  {
    key: 'Escape',
    skipWhenEditable: true,
    enabled: computed(() => isDebug.value && !debugRunning.value),
    // A dialog open on top (Edit step, Go to row) takes its own Escape: it closes.
    handler: () => {
      if (!document.querySelector('[role="dialog"]')) handleExitDebug();
    },
  },
  {
    // Run when idle/paused (visual "Test Run" or debug "Run"/"Continue");
    // same physical key either way since the two modes never overlap.
    key: 'Enter',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(
      () =>
        (canEditVisualMode.value && !hasOrderingErrors.value) ||
        (isDebug.value && !debugRunning.value && !hasOrderingErrors.value)
    ),
    handler: () => (isDebug.value ? onRun() : onDebug()),
  },
]);

const showLeaveDialog = ref(false);
const pendingNavigation = ref<(() => void) | null>(null);

onBeforeRouteLeave((_to, _from, next) => {
  if (isDebug.value && (isRunning.value || isPaused.value)) {
    pendingNavigation.value = () => next();
    showLeaveDialog.value = true;
    next(false);
  } else {
    next();
  }
});

function handleBackClick() {
  if (isDebug.value && (isRunning.value || isPaused.value)) {
    pendingNavigation.value = () => router.back();
    showLeaveDialog.value = true;
  } else if (isDebug.value) {
    // Entering debug mode never pushes a history entry (it's a local flag,
    // not a route change), so a plain router.back() here would skip past the
    // Builder entirely to whatever screen was open before it — not "exit the
    // debugger", which is what the back arrow visually implies while isDebug
    // is active. Mirror the dedicated Exit button instead.
    onExit();
  } else if (viewMode.value === 'code') {
    cancelCodeView();
  } else {
    router.back();
  }
}

function confirmLeave() {
  onExit();
  showLeaveDialog.value = false;
  pendingNavigation.value?.();
  pendingNavigation.value = null;
}

function cancelLeave() {
  showLeaveDialog.value = false;
  pendingNavigation.value = null;
}

function handleExitDebug() {
  if (isRunning.value || isPaused.value) {
    pendingNavigation.value = () => onExit();
    showLeaveDialog.value = true;
  } else {
    onExit();
  }
}

const showNewVariable = ref(false);
const extraPluginItems = ref<any[]>([]);

const menuItems = computed(() => {
  const allValidations = getAllValidations();
  const builtIn = Object.entries(allValidations).map(([group, actions]) => {
    const groupMeta = getGroupMeta(group as any);
    return {
      id: group,
      name: tGroup(group),
      label: tGroup(group),
      icon: groupMeta.icon,
      children: Object.entries(actions).map(([action, validation]: [string, any]) => ({
        type: 'action',
        params: {},
        group,
        name: action,
        label: tAction(group, action),
        description: tActionDescription(group, action) || validation.description,
        justDropped: true,
      })),
    };
  });
  return [...builtIn, ...extraPluginItems.value];
});

invokeCore(SEND.PLUGIN_LIST).then((plugins: any[]) => {
  if (!plugins?.length) return;
  plugins.forEach((p) => {
    if (p.params && typeof p.params === 'object') {
      pluginStore.register(p.group, p.params);
    }
    if (p.docs && typeof p.docs === 'object') {
      pluginStore.registerDocs(p.group, p.docs);
    }
    if (p.rules && typeof p.rules === 'object') {
      pluginStore.registerRules(p.group, p.rules);
    }
    if (p.returns && typeof p.returns === 'object') {
      pluginStore.registerReturns(p.group, p.returns);
    }
    pluginStore.registerCacheable(p.group, p.cacheable);
  });
  pluginStore.setEnabledGroups(
    plugins.filter((p) => !!p.enabled).map((p) => p.group)
  );
  extraPluginItems.value = plugins
    .filter((p) => p.enabled && p.actions?.length)
    .map((p) => ({
      id: p.group,
      name: p.name,
      label: p.name,
      icon: 'Boxes',
      isPlugin: true,
      children: p.actions.map((action: string) => ({
        type: 'action',
        params: {},
        group: p.group,
        name: action,
        label: action,
        description: p.docs?.[action]?.description ?? p.description ?? undefined,
        justDropped: true,
        source: 'plugin',
      })),
    }));
}).catch((err) => {
  console.error('[TaskEdit] Failed to load plugins:', err);
});

// Opening the builder counts as opening the workflow (Recently opened on the dashboard and Workflows page).
const recentItemsStore = useRecentItemsStore();
watch(task, (newTask: any) => {
  taskStore.setTask(newTask);
  if (newTask) recentItemsStore.markOpened('task', newTask.identifier, newTask.name, newTask.metadata?.image);
});

watch(isRunning, (running, wasRunning) => {
  if (wasRunning && !running && isDebug.value) {
    refetchGlobalVariables();
  }
});

function onNewAction() {
  showNewVariable.value = true;
}

// The actions library's + / double-click / Enter: the same item a drop would bring,
// added as the last step, then opened the way a dropped step is.
function onAddAction(item: any) {
  const pipeline = parsedSource.value?.pipeline;
  if (!pipeline) return;
  const { type: _type, justDropped: _justDropped, ...step } = JSON.parse(JSON.stringify(item));
  step.identifier = generateIdentifier();
  pipeline.actions = [...(pipeline.actions ?? []), step];
  markDirty();
  // After the canvas has copied the new list, so its row exists to open.
  nextTick(() => {
    pendingNewActionId.value = step.identifier;
    pendingOpenActionId.value = step.identifier;
    nextTick(() => {
      document.querySelector(`[data-id="${step.identifier}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
}

</script>

<template>
  <SidebarProvider class="min-h-0 h-full">
    <Sidebar v-if="!isDebug && viewMode === 'visual'" side="left">
      <div class="h-12 px-4 flex items-center border-b shrink-0">
        <span class="text-base font-semibold">{{ t('tasks.builder.actions') }}</span>
      </div>
      <SidebarContent class="p-2 overflow-hidden">
        <TaskActionsLibrary ref="actionsLibraryRef" :menu-items="menuItems" @add="onAddAction" />
      </SidebarContent>
    </Sidebar>

    <div class="w-full hidden h-full flex-1 flex-col overflow-hidden md:flex">
      <!-- Same order as the app builder: back, name, view switch | status, actions -->
      <div class="flex items-center h-12 px-3 border-b shrink-0 gap-2">
        <Button variant="ghost" size="icon" @click="handleBackClick">
          <component :is="getIconComponent('ArrowLeft')" class="w-4 h-4" />
        </Button>
        <div class="w-px h-5 bg-border" />
        <span v-if="breadcrumbChain.length <= 1" class="font-semibold text-sm truncate">{{ task?.name }}</span>
        <Breadcrumb v-else class="min-w-0">
          <BreadcrumbList class="flex-nowrap">
            <template v-for="(entry, index) in breadcrumbChain" :key="entry.identifier">
              <BreadcrumbSeparator v-if="index > 0" />
              <BreadcrumbItem>
                <BreadcrumbLink
                  v-if="index !== breadcrumbChain.length - 1"
                  class="cursor-pointer truncate max-w-40"
                  @click.prevent="jumpTo(entry)"
                >
                  {{ entry.name }}
                </BreadcrumbLink>
                <BreadcrumbPage v-else class="font-semibold text-sm truncate max-w-40">
                  {{ entry.name }}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>

        <span
          v-if="isDebug"
          class="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
          :class="{
            'bg-muted text-muted-foreground': debugProgress.state === 'idle' || debugProgress.state === 'stopped',
            'bg-blue-500/15 text-blue-700 dark:text-blue-300': debugProgress.state === 'running',
            'bg-amber-500/15 text-amber-800 dark:text-amber-300': debugProgress.state === 'paused',
            'bg-destructive/15 text-destructive': debugProgress.state === 'failed' || debugProgress.state === 'waiting',
            'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300': debugProgress.state === 'finished',
          }"
          data-testid="debug-status"
        >
          {{ debugStatusText }}
        </span>

        <div v-if="!isDebug" class="ml-3 flex items-center rounded-md border p-0.5">
          <Button
            size="sm"
            :variant="viewMode === 'visual' ? 'secondary' : 'ghost'"
            class="h-7 gap-1 px-2"
            :title="viewMode === 'code' ? `${t('builder.discardCode')} (Esc)` : undefined"
            @click="viewMode === 'code' && cancelCodeView()"
          >
            <component :is="getIconComponent('LayoutGrid')" class="w-3.5 h-3.5" /> {{ t('builder.modes.design') }}
          </Button>
          <Button
            size="sm"
            :variant="viewMode === 'code' ? 'secondary' : 'ghost'"
            class="h-7 gap-1 px-2"
            title="⌘E"
            @click="viewMode === 'visual' && enterCodeView()"
          >
            <component :is="getIconComponent('Code2')" class="w-3.5 h-3.5" /> YAML
          </Button>
        </div>

        <div class="flex-1" />

        <Transition name="fade">
          <span v-if="savedIndicator" class="flex items-center gap-1 text-xs text-muted-foreground">
            <component :is="getIconComponent('Check')" class="w-3 h-3 text-green-500" />
            {{ t('common.saved') }}
          </span>
        </Transition>

        <template v-if="!isDebug && viewMode === 'code'">
          <Button variant="ghost" size="sm" @click="cancelCodeView">
            {{ t('builder.discardCode') }}
            <kbd
              class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
            >
              Esc
            </kbd>
          </Button>
          <Button variant="default" size="sm" @click="applyAndSaveCodeView">
            <component :is="getIconComponent('Save')" class="w-4 h-4" />
            {{ t('builder.save') }}
            <kbd
              class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 font-mono text-[10px] font-medium text-primary-foreground opacity-100"
            >
              <span class="text-xs">⌘</span>S
            </kbd>
          </Button>
        </template>
        <TaskPipelineControls
          v-if="!isDebug && viewMode === 'visual'"
          :has-ordering-errors="hasOrderingErrors"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :projects="task?.projects ?? []"
          @save="onSave"
          @debug="onDebug"
          @undo="onUndo"
          @redo="onRedo"
        />
        <TaskPipelineDebugControls
          v-if="isDebug"
          :is-running="isRunning"
          :is-paused="isPaused"
          :has-ordering-errors="hasOrderingErrors"
          :has-cached-steps="hasCachedSteps"
          v-model:cache-mode="debugCacheMode"
          @run="onRun"
          @stop="onStop"
          @pause="onPause"
          @next="onNext"
          @next-pass="onNextPass"
          :can-next-pass="canNextPass"
          :can-step-over="canStepOver"
          :can-step-out="canStepOut"
          @step-over="onStepOver"
          @step-out="onStepOut"
          @exit="handleExitDebug"
        />
        <div class="w-px h-5 bg-border" />
        <AssistantButton />
      </div>

      <DraftBanner :task="task" />

      <div v-if="!isDebug && viewMode === 'visual'" class="overflow-y-auto flex-1 min-h-0">
        <div class="p-2 bg-background min-h-full">
          <TaskPipelineCanvasSkeleton v-if="!parsedSource" />
          <TaskPipelineCanvas
            v-else
            v-model="parsedSource.pipeline.actions"
            :isDebug="false"
            :variables="parsedSource.pipeline.variables ?? []"
            :globalVariables="globalVariables ?? []"
            :taskIdentifier="identifier"
          />
        </div>
      </div>

      <div v-if="!isDebug && viewMode === 'code'" class="flex-1 min-h-0">
        <TaskCodeEditor
          v-model="codeText"
          :errors="codeErrors"
        />
      </div>

      <ResizablePanelGroup
        v-if="isDebug"
        direction="vertical"
        class="flex-1 min-h-0"
      >
        <ResizablePanel :default-size="65" class="flex min-h-0">
          <!-- The run's steps, like the run page: the workflow's, each sub-workflow's under
               the step that runs it. A picked step's details are in the Step tab below. -->
          <div class="flex flex-col flex-1 min-w-0 min-h-0 px-3 pt-2 pb-2">
            <div class="flex items-center gap-2 mb-2 min-h-8">
              <div class="ml-auto flex items-center gap-1">
                <Button
                  v-if="debugTracks[MAIN_TRACK]?.pipelineId"
                  variant="ghost"
                  size="sm"
                  :title="t('runWindow.openHint')"
                  @click="openDebugRun(debugTracks[MAIN_TRACK])"
                >
                  <component :is="getIconComponent('ExternalLink')" class="w-4 h-4 mr-1" />
                  {{ t('debugInspector.openRun') }}
                </Button>
                <Button
                  :variant="showDebugVariables ? 'secondary' : 'outline'"
                  size="sm"
                  :title="showDebugVariables ? t('runVariables.hide') : undefined"
                  @click="showDebugVariables = !showDebugVariables"
                >
                  <component :is="getIconComponent('Braces')" class="w-4 h-4 mr-1" />
                  {{ t('runVariables.show') }}
                </Button>
              </div>
            </div>

            <div
              v-if="debugBanner"
              class="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3 py-2 text-[13px]"
              :class="debugBanner.tone === 'failed' ? 'border-destructive/30 bg-destructive/5' : 'border-blue-500/30 bg-blue-500/5'"
              data-testid="debug-banner"
            >
              <span class="size-2 shrink-0 rounded-full" :class="debugBanner.tone === 'failed' ? 'bg-destructive' : 'bg-blue-500'" />
              <span class="font-semibold">{{ debugBanner.title }}</span>
              <span v-if="debugBanner.detail" class="min-w-0 truncate text-muted-foreground" :class="debugBanner.tone === 'failed' ? 'font-mono text-xs' : ''">
                {{ debugBanner.detail }}
              </span>
              <span v-if="debugBanner.hint" class="ml-auto shrink-0 text-xs text-muted-foreground">{{ debugBanner.hint }}</span>
              <!-- Where it is: the workflow, then each sub-workflow step down to it. -->
              <nav
                v-if="debugBanner.calls.length"
                class="flex basis-full flex-wrap items-center gap-1 text-xs text-muted-foreground"
                :aria-label="t('debugStatus.callPath')"
                data-testid="debug-call-path"
              >
                <component :is="getIconComponent('ListTree')" class="w-3.5 h-3.5 text-violet-500" />
                <template v-for="(call, i) in debugBanner.calls" :key="call.key ?? 'workflow'">
                  <span v-if="i > 0" aria-hidden="true">›</span>
                  <button
                    v-if="call.key"
                    type="button"
                    class="font-medium text-violet-600 hover:underline underline-offset-2 dark:text-violet-400"
                    @click="debugTimeline.selectKey(call.key)"
                  >
                    {{ call.name }}
                  </button>
                  <span v-else class="font-medium text-foreground">{{ call.name }}</span>
                </template>
              </nav>
            </div>
            <DebugStepList
              v-if="debugTracks[MAIN_TRACK]"
              :actions="debugTracks[MAIN_TRACK].actions"
              :ended="debugTracks[MAIN_TRACK].ended"
              :selected-key="debugTimeline.selectedKey.value"
              :breakpoints="breakpointRows"
              :labels="debugLabels"
              @select="debugTimeline.selectKey"
              @toggle-breakpoint="toggleRowBreakpoint"
            />
            <RunStepsSkeleton v-else />
          </div>

          <!-- The workflow's variables as the run leaves them, beside the steps like on
               the run page (closed stays closed). -->
          <aside v-if="showDebugVariables" class="flex w-80 xl:w-96 shrink-0 flex-col min-h-0 border-l">
            <!-- Paused inside a sub-workflow: its variables, or the workflow's. -->
            <div
              v-if="subVariablesKey"
              class="mx-3 mt-2 inline-flex self-start rounded-md border p-0.5 text-xs"
              role="tablist"
              data-testid="debug-variables-level"
            >
              <button
                v-for="workflowLevel in [false, true]"
                :key="String(workflowLevel)"
                role="tab"
                class="rounded px-2 py-0.5 font-medium transition-colors"
                :class="variablesOfWorkflow === workflowLevel ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
                :aria-selected="variablesOfWorkflow === workflowLevel"
                @click="variablesOfWorkflow = workflowLevel"
              >
                {{ workflowLevel ? (task?.name ?? identifier) : debugTimeline.subVariables(subVariablesKey)?.name }}
              </button>
            </div>
            <DebugVariablesPanel
              v-if="shownSubVariables"
              :key="subVariablesKey ?? ''"
              class="flex-1"
              :variables="shownSubVariables.variables"
              :initial="shownSubVariables.initial"
              :history="shownSubVariables.history"
              :last-changed="shownSubVariables.lastChanged"
              :task-id="debugTracks[subVariablesKey!]?.taskId ?? identifier"
              :can-edit="isPaused && debugTimeline.pausedTrack.value === subVariablesKey"
              @set-variable="setDebugVariable"
            />
            <DebugVariablesPanel
              v-else
              class="flex-1"
              :variables="activeVariables ?? []"
              :initial="debugInitialValues"
              :history="debugTimeline.variableHistory.value"
              :last-changed="debugTimeline.lastChanged.value"
              :task-id="identifier"
              :can-edit="isPaused && debugTimeline.pausedTrack.value === MAIN_TRACK"
              @set-variable="setDebugVariable"
            />
          </aside>
        </ResizablePanel>

        <ResizableHandle :with-handle="true" />

        <ResizablePanel :default-size="35">
          <TaskDebugFooter v-model:tab="debugBottomTab" :events="executionEvents">
            <DebugStepInspector
              :action="debugSelectedStep"
              :ended="debugSelectedTrack?.ended ?? false"
              :can-open-run="!!debugSelectedTrack?.pipelineId"
              :can-edit="canEditSelected"
              :raw-params="selectedSourceStep?.params ?? null"
              @open-run="openDebugRun(debugSelectedTrack)"
              @run="onNext"
              @skip="onSkip"
              @retry="onRetry"
              @edit="openStepEditor"
            />
          </TaskDebugFooter>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>

    <Sidebar v-if="!isDebug && viewMode === 'visual'" side="right">
      <div class="h-12 px-4 flex items-center justify-between border-b shrink-0">
        <span class="text-base font-semibold">{{ t('tasks.builder.variables') }}</span>
        <Button variant="ghost" size="icon" @click="onNewAction">
          <component :is="getIconComponent('Plus')" class="w-4 h-4" />
        </Button>
      </div>
      <SidebarContent class="p-2">
        <TaskVariablesPanelSkeleton v-if="!parsedSource" />
        <TaskVariablesPanel
          v-else
          @save="onSave"
          v-model="parsedSource.pipeline.variables"
          :global-variables="globalVariables ?? []"
          :actions="parsedSource.pipeline.actions ?? []"
          :show-new="showNewVariable"
          @update:show-new="showNewVariable = $event"
        />
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>

  <TaskGoToRowModal v-model:open="showGoToRow" :maxRow="totalRows" @submit="onGoToRowSubmit" />
  <!-- The debugger's Edit step. Always mounted, like the canvas's: the dialog fills its
       form when `open` or the step changes, not when it first appears. -->
  <TaskDialogActionEdit
    v-model:open="editStepOpen"
    v-model:actionParams="editingStep"
    :variables="parsedSource?.pipeline?.variables ?? []"
    :globalVariables="globalVariables ?? []"
    :taskIdentifier="identifier"
    @handleSave="onStepEdited"
  />

  <AlertDialog :open="showLeaveDialog">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tasks.builder.leaveAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tasks.builder.leaveAlert.description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="cancelLeave">{{ t('tasks.builder.leaveAlert.stay') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmLeave">{{ t('tasks.builder.leaveAlert.stopAndLeave') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

import { ref, watch, computed, toRaw, type Ref } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import yaml from 'js-yaml';
import { generateIdentifier } from '@tipeline/utils';
import { taskSchema } from '@tipeline/schemas';
import { useSaveTask } from '@/composables/useSaveTask';
import { useTaskExecution } from '@/composables/useTaskExecution';
import { useActionManipulation } from '@/composables/useActionManipulation';
import { useSourceHistory } from '@/composables/useSourceHistory';
import { toast } from '@/components/ui/sonner';
// @ts-ignore
import { transformVariablesToValues } from '@/utils/variableTransformers';
import { SEND } from '@/ipc-channels';
import { hasStepCache, type RunCacheChoice } from '@/utils/stepCache';
import type { SubRun } from '@/composables/useDebugTimeline';

interface Task {
  id: string;
  name: string;
  source?: string;
  [key: string]: any;
}

export function useTaskSource(identifier: string, task: Ref<Task | null>) {
  const { updateSource, isDirty, markDirty } = useSaveTask();
  const {
    isRunning,
    executeTask,
    sendDebugNext,
    sendDebugRun,
    sendDebugPause,
    sendDebugStop,
    sendDebugCommand,
    events: executionEvents,
    executionError,
  } = useTaskExecution();
  const { findAndUpdateActionById } = useActionManipulation();

  const parsedSource = ref<any>();
  const history = useSourceHistory(parsedSource);
  const parsedSourceDebug = ref<any>();
  const isDebug = ref(false);
  const isPaused = ref(false);
  // How the next debug run uses cached step results (set in the debug toolbar, kept
  // while the builder is open). A debug run never uses the workflow cache.
  const debugCacheMode = ref<RunCacheChoice>('use');
  const hasCachedSteps = computed(() => hasStepCache(parsedSource.value?.pipeline?.actions));
  const savedIndicator = ref(false);
  // Steps a debug run pauses before, kept per workflow.
  const breakpoints = useLocalStorage<string[]>(`tipeline:debugger:breakpoints:${identifier}`, []);
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // The sub-workflow runs a debug run started, in order (keyed by pipelineIdentifier):
  // the debugger lists each one's steps under the step that started it.
  const subtaskTabs = ref<SubRun[]>([]);

  // Raw-code editing: lets the user drop out of the visual canvas into a YAML
  // view of the same task and back, so both stay in sync with the DB's JSON.
  const viewMode = ref<'visual' | 'code'>('visual');
  const codeText = ref('');
  const codeErrors = ref<string[]>([]);

  function enterCodeView() {
    codeText.value = yaml.dump(JSON.parse(JSON.stringify(toRaw(parsedSource.value))), {
      noRefs: true,
      lineWidth: 120,
    });
    codeErrors.value = [];
    viewMode.value = 'code';
  }

  // Only checks shape locally (via the schema core also validates against —
  // fast feedback for YAML syntax/shape mistakes without a round trip).
  // Whether the action types it references actually exist can only be
  // answered by core's live registry (built-ins + currently enabled
  // plugins), so that check — and the actual persistence — happens
  // server-side in TASK_UPDATE_SOURCE. parsedSource/viewMode are only
  // updated once core confirms the save, so a rejected save never leaves
  // the canvas holding unpersisted data.
  async function applyAndSaveCodeView(): Promise<boolean> {
    let loaded: unknown;
    try {
      loaded = yaml.load(codeText.value);
    } catch (err) {
      codeErrors.value = [err instanceof Error ? err.message : String(err)];
      return false;
    }

    const result = taskSchema.safeParse(loaded);
    if (!result.success) {
      codeErrors.value = result.error.issues.map((issue) =>
        issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message
      );
      return false;
    }

    try {
      const response = await updateSource(identifier, result.data);
      parsedSource.value = response?.source ? JSON.parse(response.source) : result.data;
      history.record();
      syncTaskMeta(response);
      codeErrors.value = [];
      viewMode.value = 'visual';
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      codeErrors.value = message
        .replace(/^task\.validationFailed\n?/, '')
        .split('\n')
        .filter(Boolean);
      return false;
    }
  }

  // updateSource's response carries the task's freshly persisted meta fields
  // (TaskService.updateSource now syncs name/description/etc. from the saved
  // source into the DB columns) — but `task` here is the query result the
  // rest of the page reads for its title/breadcrumb, and nothing re-fetches
  // it automatically. Patch it in place so a code-view rename shows up
  // immediately instead of only after leaving and re-entering the builder.
  function syncTaskMeta(response: any) {
    if (!response || !task.value) return;
    task.value.name = response.name;
    task.value.description = response.description;
    task.value.author = response.author;
    task.value.version = response.version;
    task.value.platform = response.platform;
    if (response.tags !== undefined) task.value.tags = response.tags;
  }

  function cancelCodeView() {
    codeErrors.value = [];
    viewMode.value = 'visual';
  }

  // Its steps and variables, from the sub-workflow as saved (the run's events fill them in).
  async function loadSubtaskSource(pipelineId: string, taskId: string) {
    const result = await window.ipcRenderer.invoke(SEND.TASK_DETAIL, {
      correlationId: generateIdentifier(),
      payload: { identifier: taskId },
    });
    const tab = subtaskTabs.value.find((t) => t.pipelineId === pipelineId);
    if (!tab) return;
    if (result?.source) {
      const parsed = JSON.parse(result.source);
      tab.actions = parsed?.pipeline?.actions ?? [];
      tab.variables = parsed?.pipeline?.variables ?? [];
    }
    if (result?.name) tab.name = result.name;
  }

  function clearSubRuns() {
    subtaskTabs.value = [];
  }

  watch(task, (newTask: any) => {
    if (newTask?.source) {
      try {
        parsedSource.value = JSON.parse(newTask.source);
        history.reset();
      } catch (err) {
        console.error('Failed to parse task.source:', err);
        parsedSource.value = null;
      }
    }
  });

  watch(isDirty, (dirty) => {
    if (!dirty) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (isDirty.value && parsedSource.value) {
        await onSave();
        savedIndicator.value = true;
        setTimeout(() => {
          savedIndicator.value = false;
        }, 2000);
      }
    }, 1500);
  });

  async function onSave() {
    history.record();
    try {
      const response = await updateSource(identifier, parsedSource.value);
      if (response?.source) {
        parsedSource.value = JSON.parse(response.source);
        history.sync();
      }
      syncTaskMeta(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message.replace(/^task\.validationFailed\n?/, ''));
    }
  }

  function clearRunningState(actions: any[]) {
    for (const action of actions) {
      delete action.running;
      if (Array.isArray(action.params?.actions)) clearRunningState(action.params.actions);
    }
  }

  function markNextAsRunning(actions: any[]): boolean {
    for (const action of actions) {
      if (action.finished || action.error || action.disabled) {
        if (action.finished && Array.isArray(action.params?.actions)) {
          if (markNextAsRunning(action.params.actions)) return true;
        }
        continue;
      }
      action.running = true;
      return true;
    }
    return false;
  }

  function clearDebugState() {
    function clearActions(actions: any[]) {
      for (const action of actions) {
        delete action.finished;
        delete action.error;
        delete action.running;
        if (Array.isArray(action.params?.actions)) clearActions(action.params.actions);
      }
    }
    if (parsedSourceDebug.value?.pipeline?.actions) {
      clearActions(parsedSourceDebug.value.pipeline.actions);
    }
  }

  function startExecution(stepMode: boolean) {
    clearSubRuns();
    const data = transformVariablesToValues(
      JSON.parse(JSON.stringify(parsedSource.value.pipeline.variables))
    );
    parsedSourceDebug.value = JSON.parse(JSON.stringify(parsedSource.value));
    isPaused.value = false;
    markNextAsRunning(parsedSourceDebug.value.pipeline.actions);
    const cache = hasCachedSteps.value && debugCacheMode.value !== 'use' ? debugCacheMode.value : undefined;
    executeTask(identifier, data, stepMode, true, cache, coreBreakpoints());
  }

  // Breakpoints as Core takes them: `workflow:step`. A step of this workflow is kept by
  // its identifier alone; one inside a sub-workflow already names its workflow.
  function coreBreakpoints() {
    return breakpoints.value.map((id) => (id.includes(':') ? id : `${identifier}:${id}`));
  }

  // A run that's going (or paused) can still take commands.
  const debugRunActive = computed(() => isRunning.value || isPaused.value);

  function toggleBreakpoint(stepIdentifier: string) {
    breakpoints.value = breakpoints.value.includes(stepIdentifier)
      ? breakpoints.value.filter((id) => id !== stepIdentifier)
      : [...breakpoints.value, stepIdentifier];
    if (debugRunActive.value) sendDebugCommand('breakpoints', { identifiers: coreBreakpoints() });
  }

  /** Paused: leave out the step it waits at (before it, or after it failed). */
  function onSkip() {
    if (!isPaused.value) return;
    isPaused.value = false;
    sendDebugCommand('skip');
  }

  /** Paused in a loop: run the rest of this pass, then pause again. */
  function onNextPass() {
    if (!isPaused.value) return;
    isPaused.value = false;
    sendDebugCommand('nextPass');
  }

  /** Paused before a step: run it to its end (a whole sub-workflow, say), then pause. */
  function onStepOver() {
    if (!isPaused.value) return;
    isPaused.value = false;
    sendDebugCommand('stepOver');
  }

  /** Paused inside a sub-workflow: run the rest of it, then pause in the one that called it. */
  function onStepOut() {
    if (!isPaused.value) return;
    isPaused.value = false;
    sendDebugCommand('stepOut');
  }

  /** Paused at a failed step: run it again (with any edits made since). */
  function onRetry() {
    if (!isPaused.value) return;
    isPaused.value = false;
    sendDebugCommand('retry');
  }

  /** A step's settings changed in the debugger: the run uses them the next time it runs it. */
  function sendStepUpdate(step: { identifier: string; params: any; destination?: string }) {
    if (!debugRunActive.value) return false;
    sendDebugCommand('updateStep', {
      identifier: step.identifier,
      params: step.params ?? {},
      destination: step.destination ?? '',
    });
    return true;
  }

  /** Paused: give a workflow variable a new value for the rest of the run. */
  function setDebugVariable(name: string, value: unknown) {
    if (!isPaused.value) return;
    sendDebugCommand('setVariable', { name, value });
  }

  function onRun() {
    if (isPaused.value) {
      isPaused.value = false;
      sendDebugRun();
      if (parsedSourceDebug.value?.pipeline?.actions) {
        markNextAsRunning(parsedSourceDebug.value.pipeline.actions);
      }
    } else {
      startExecution(false);
    }
  }

  function onNext() {
    if (isPaused.value) {
      isPaused.value = false;
      sendDebugNext();
      if (parsedSourceDebug.value?.pipeline?.actions) {
        markNextAsRunning(parsedSourceDebug.value.pipeline.actions);
      }
    } else {
      startExecution(true);
    }
  }

  function onPause() {
    sendDebugPause();
  }

  function onStop() {
    isPaused.value = false;
    sendDebugStop();
    clearDebugState();
    clearSubRuns();
  }

  function onExit() {
    if (isRunning.value) {
      sendDebugStop();
    }
    isPaused.value = false;
    isDebug.value = false;
    clearSubRuns();
  }

  function onDebug() {
    isDebug.value = true;
    cancelCodeView();
    parsedSourceDebug.value = JSON.parse(JSON.stringify(parsedSource.value));
  }

  let pausedEndProcessedCount = 0;
  watch(
    executionEvents,
    (newEvents) => {
      if (newEvents.length < pausedEndProcessedCount) pausedEndProcessedCount = 0;
      const pending = newEvents.slice(pausedEndProcessedCount);
      pausedEndProcessedCount = newEvents.length;
      for (const latest of pending) {
        if (latest.type === 'paused') {
          isPaused.value = true;
          // A variable changed while paused (Change value): show its new value.
          const variables: any[] = parsedSourceDebug.value?.pipeline?.variables ?? [];
          for (const changed of latest.data?.changedVariables ?? []) {
            const variable = variables.find((v: any) => v.name === changed.name);
            if (variable) variable.value = changed.value;
          }
          if (parsedSourceDebug.value?.pipeline?.actions) {
            clearRunningState(parsedSourceDebug.value.pipeline.actions);
          }
        } else if (latest.type === 'end' || latest.type === 'end_all' || latest.type === 'error') {
          isPaused.value = false;
          if (parsedSourceDebug.value?.pipeline?.actions) {
            clearRunningState(parsedSourceDebug.value.pipeline.actions);
          }
        }
      }
    },
    { deep: true }
  );

  let actionRoutingProcessedCount = 0;
  watch(
    executionEvents,
    (newEvents) => {
      if (newEvents.length < actionRoutingProcessedCount) actionRoutingProcessedCount = 0;
      const pending = newEvents.slice(actionRoutingProcessedCount);
      actionRoutingProcessedCount = newEvents.length;
      if (!parsedSourceDebug.value || (!isRunning.value && !isPaused.value)) return;

      for (const latest of pending) {
        const isSubtaskEvent = latest.taskIdentifier && latest.taskIdentifier !== identifier;

        // A sub-workflow started: the run and step that started it, and what it starts with.
        if (latest.type === 'start' && isSubtaskEvent) {
          subtaskTabs.value.push({
            pipelineId: latest.pipelineIdentifier,
            taskId: latest.taskIdentifier,
            name: latest.data?.name || latest.taskIdentifier,
            actions: [],
            variables: [],
            parent: latest.data?.parent ?? null,
            startValues: Object.fromEntries(
              (latest.data?.variables ?? []).map((v: { name: string; value: unknown }) => [v.name, v.value])
            ),
          });
          loadSubtaskSource(latest.pipelineIdentifier, latest.taskIdentifier);
          continue;
        }

        // The workflow's own steps (a sub-workflow's are followed by the debugger's lists).
        if (latest.type === 'action') {
          const eventIdentifier = latest.data?.identifier;
          if (!isSubtaskEvent) {
            if (eventIdentifier) {
              findAndUpdateActionById(parsedSourceDebug.value.pipeline.actions, eventIdentifier, {
                finished: true,
                running: false,
              });
            }
            const changedVariables: Array<{ name: string; value: unknown }> =
              latest.data?.changedVariables ?? [];
            if (changedVariables.length > 0) {
              const variables: any[] = parsedSourceDebug.value.pipeline.variables ?? [];
              for (const changed of changedVariables) {
                const variable = variables.find((v: any) => v.name === changed.name);
                if (variable) variable.value = changed.value;
              }
            }
            // Mark the next pending action as running (cleared by 'paused' or 'end' events)
            clearRunningState(parsedSourceDebug.value.pipeline.actions);
            markNextAsRunning(parsedSourceDebug.value.pipeline.actions);
          }
        }

        if (latest.type === 'action_error') {
          const eventIdentifier = latest.data?.identifier;
          if (!isSubtaskEvent) {
            if (eventIdentifier) {
              findAndUpdateActionById(parsedSourceDebug.value.pipeline.actions, eventIdentifier, {
                error: true,
                running: false,
              });
            }
            clearRunningState(parsedSourceDebug.value.pipeline.actions);
          }
        }
      }
    },
    { deep: true }
  );

  // Undo/redo put the earlier source back in the editor and save it like any edit.
  // A change that hasn't been autosaved yet counts as something to undo.
  const canUndo = computed(() => history.canUndo.value || isDirty.value);
  const canRedo = history.canRedo;

  function onUndo() {
    if (history.undo()) markDirty();
  }

  function onRedo() {
    if (history.redo()) markDirty();
  }

  const activeVariables = computed(() =>
    isDebug.value
      ? parsedSourceDebug.value?.pipeline?.variables ?? []
      : parsedSource.value?.pipeline?.variables ?? []
  );

  return {
    parsedSource,
    parsedSourceDebug,
    isDebug,
    isPaused,
    isRunning,
    debugCacheMode,
    hasCachedSteps,
    savedIndicator,
    activeVariables,
    executionEvents,
    executionError,
    subtaskTabs,
    clearSubRuns,
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
  };
}

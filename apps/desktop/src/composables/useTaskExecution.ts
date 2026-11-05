import { watch, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStream } from '@/composables/useStream';
import { SEND } from '@/ipc-channels';
import { toast } from '@/components/ui/sonner';

export function useTaskExecution() {
  const { t } = useI18n();
  const { execute, events, isRunning, stop, currentCorrelationId } = useStream();
  const executionError = ref<string | null>(null);

  let processedCount = 0;
  watch(events, (newEvents) => {
    if (newEvents.length < processedCount) processedCount = 0;
    const pending = newEvents.slice(processedCount);
    processedCount = newEvents.length;
    for (const latest of pending) {
      if (latest.type === 'error') {
        const msg = typeof latest.error === 'string'
          ? latest.error
          : latest.error?.message ?? t('common.unknownError');
        executionError.value = msg;
        toast.error(t('tasks.taskFailed'), { description: msg });
      } else if (latest.type === 'start') {
        executionError.value = null;
      }
    }
  }, { deep: true });

  /**
   * cache: 'bypass' runs every step without the result cache, 'refresh' replaces what's stored.
   * breakpoints: a debug run pauses before these steps.
   */
  function executeTask(
    identifier: string,
    variables: any = {},
    stepMode = false,
    debugMode = false,
    cache?: 'bypass' | 'refresh',
    breakpoints: string[] = []
  ) {
    executionError.value = null;
    execute(SEND.TASK_EXEC, {
      identifier,
      variables,
      stepMode,
      debugMode,
      ...(cache ? { cache } : {}),
      ...(breakpoints.length ? { breakpoints } : {}),
    });
  }

  function sendDebugNext() {
    if (!currentCorrelationId.value) return;
    window.ipcRenderer.send(SEND.DEBUG_NEXT, { correlationId: currentCorrelationId.value });
  }

  function sendDebugRun() {
    if (!currentCorrelationId.value) return;
    window.ipcRenderer.send(SEND.DEBUG_RUN, { correlationId: currentCorrelationId.value });
  }

  function sendDebugPause() {
    if (!currentCorrelationId.value) return;
    window.ipcRenderer.send(SEND.DEBUG_PAUSE, { correlationId: currentCorrelationId.value });
  }

  /**
   * The debugger's other commands, for a paused run (or any debug run, for breakpoints):
   * skip, nextPass, retry, breakpoints { identifiers }, updateStep { identifier, params,
   * destination }, setVariable { name, value }.
   */
  function sendDebugCommand(command: string, data: Record<string, unknown> = {}) {
    if (!currentCorrelationId.value) return;
    window.ipcRenderer.send(SEND.DEBUG_COMMAND, {
      correlationId: currentCorrelationId.value,
      payload: JSON.parse(JSON.stringify({ command, ...data })),
    });
  }

  function sendDebugStop() {
    if (!currentCorrelationId.value) return;
    window.ipcRenderer.send(SEND.DEBUG_STOP, { correlationId: currentCorrelationId.value });
    stop();
  }

  return {
    isRunning,
    executeTask,
    events,
    executionError,
    currentCorrelationId,
    stopExecution: stop,
    sendDebugNext,
    sendDebugRun,
    sendDebugPause,
    sendDebugStop,
    sendDebugCommand,
  };
}

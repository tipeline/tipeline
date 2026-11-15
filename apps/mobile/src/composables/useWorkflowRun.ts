import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { ConnectionLostError, type RunHandle, type TipelineClient } from '@tipeline/client';
import { applyRunEvent, startProgress, type RunProgress } from '@/lib/runProgress';
import type { StepInfo } from '@/lib/workflows';

/**
 * Starts a workflow and follows it. Leaving the screen stops listening; the run itself
 * carries on on the Server.
 */
export function useWorkflowRun(client: () => TipelineClient) {
  const progress = ref<RunProgress | null>(null);
  const handle = shallowRef<RunHandle | null>(null);

  function start(identifier: string, variables: Record<string, unknown>, steps: StepInfo[]) {
    handle.value?.stopListening();
    progress.value = startProgress(steps);
    const run = client().run('exec', { identifier, variables }, (event) => {
      if (handle.value !== run || !progress.value) return;
      progress.value = applyRunEvent(progress.value, event);
    });
    handle.value = run;
    run.done.catch((err) => {
      if (handle.value !== run || !progress.value) return;
      progress.value = {
        ...progress.value,
        state: err instanceof ConnectionLostError ? 'lost' : 'failed',
        error: err instanceof ConnectionLostError ? null : (err as Error).message,
      };
    });
  }

  function reset() {
    handle.value?.stopListening();
    handle.value = null;
    progress.value = null;
  }

  onBeforeUnmount(() => handle.value?.stopListening());

  return { progress, start, reset };
}

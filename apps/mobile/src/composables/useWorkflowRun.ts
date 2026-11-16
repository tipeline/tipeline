import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { ConnectionLostError, type RunHandle, type TipelineClient } from '@tipeline/client';
import { applyRunEvent, startProgress, withFinalValues, withStepStates, type FinalVariable, type RunProgress } from '@/lib/runProgress';
import { runSteps, type RunDetail } from '@/lib/runs';
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
      const next = applyRunEvent(progress.value, event);
      // Finished, canceled or waiting at an approval: the run's detail says which, so the
      // page shows it as running until then (no "Finished" flashing before "Canceled").
      if (event.type === 'end_all' && next.state === 'finished' && next.pipelineIdentifier) next.state = 'running';
      progress.value = next;
    });
    handle.value = run;
    run.done
      .then(async (last) => {
        const pipelineIdentifier = progress.value?.pipelineIdentifier;
        if (last.type !== 'end_all' || !pipelineIdentifier) return;
        // The final values, including outputs no step changed. Without them the live values stay.
        const detail = await client()
          .request<(RunDetail & { variables?: FinalVariable[] }) | null>('pipelineDetail', { pipelineIdentifier })
          .catch(() => null);
        if (handle.value !== run || !progress.value) return;
        if (!Array.isArray(detail?.variables)) {
          if (progress.value.state === 'running') progress.value = { ...progress.value, state: 'finished' };
          return;
        }
        const ended = progress.value.state === 'running' ? { ...progress.value, state: 'finished' as const } : progress.value;
        progress.value = withStepStates(withFinalValues(ended, detail.variables, detail.status), runSteps(detail));
      })
      .catch(() => {});
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

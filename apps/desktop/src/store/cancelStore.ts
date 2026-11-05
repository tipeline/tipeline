import { defineStore } from 'pinia';
import { reactive, watch } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useStreamStore } from '@/store/stream';

/**
 * Names a run to cancel: by its pipelineIdentifier, or — for a run that doesn't persist
 * (an app runnable with `persist: false`) — by the correlationId of the request that
 * started it.
 */
export type CancelTarget = { pipelineIdentifier: string } | { correlationId: string };

export type CancelResult = 'canceling' | 'canceled' | 'not_running';

const keyOf = (target: CancelTarget) =>
  'pipelineIdentifier' in target ? `p:${target.pipelineIdentifier}` : `c:${target.correlationId}`;

/**
 * Runs this window asked to cancel that haven't ended yet. A running run stops at its
 * next step, which can take a while — every view of it shows "Canceling…" until its end
 * event arrives.
 */
export const useCancelStore = defineStore('cancel', () => {
  const pending = reactive(new Set<string>());
  const stream = useStreamStore();

  // A run's end clears it: `end` names the run (pipelineIdentifier), `end_all` / `error`
  // the request that started it (correlationId).
  watch(
    () => stream.events.length,
    () => {
      if (!pending.size) return;
      const latest = stream.events[stream.events.length - 1];
      if (!latest || !['end', 'end_all', 'error'].includes(latest.type)) return;
      if (latest.pipelineIdentifier) pending.delete(`p:${latest.pipelineIdentifier}`);
      if (latest.correlationId) pending.delete(`c:${latest.correlationId}`);
    }
  );

  function isCanceling(target: CancelTarget | null | undefined): boolean {
    return !!target && pending.has(keyOf(target));
  }

  /** Asks core to cancel the run. Throws what core answers when it can't. */
  async function cancel(target: CancelTarget): Promise<CancelResult> {
    const key = keyOf(target);
    pending.add(key);
    try {
      // "desktop" on a local workspace; a server records the signed-in user instead.
      const result = await invokeCore<{ status: CancelResult }>(SEND.PIPELINE_CANCEL, {
        ...target,
        canceledBy: 'desktop',
      });
      if (result?.status !== 'canceling') pending.delete(key);
      return result?.status ?? 'not_running';
    } catch (e) {
      pending.delete(key);
      throw e;
    }
  }

  return { pending, isCanceling, cancel };
});

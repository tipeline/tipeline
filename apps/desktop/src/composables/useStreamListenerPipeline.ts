import { computed } from 'vue';
import { useStreamStore, type StreamEvent } from '@/store/stream';

/**
 * Returns a filtered view of stream events for a specific pipeline execution.
 * hasEnded becomes true when a terminal event (end or error) is received.
 */
export function useStreamListenerPipeline(pipelineIdentifier: string) {
  const store = useStreamStore();

  const events = computed<StreamEvent[]>(() =>
    store.events.filter((e) => e.pipelineIdentifier === pipelineIdentifier)
  );

  // 'end' (Pipeline.ts's taskEnd) reliably carries this pipeline's identifier.
  // 'end_all' (the outer exec/run handler's completion broadcast) currently
  // broadcasts a bare string as its data payload, so it never carries a
  // pipelineIdentifier and would never match the filter above on its own —
  // still checked here in case that's fixed, or for paths where it does.
  const hasEnded = computed(() =>
    events.value.some((e) => e.type === 'end' || e.type === 'end_all' || e.type === 'error')
  );

  return { events, hasEnded };
}

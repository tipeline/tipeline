import { computed } from 'vue';
import { useStreamStore, type StreamEvent } from '@/store/stream';

/**
 * Returns a filtered view of the global stream event log.
 * When taskIdentifier is provided, only events for that task are returned.
 * Without it, all events across all executions are returned.
 */
export function useStreamListener(taskIdentifier?: string) {
  const store = useStreamStore();

  const events = computed<StreamEvent[]>(() => {
    if (taskIdentifier) {
      return store.events.filter((e) => e.taskIdentifier === taskIdentifier);
    }
    return store.events;
  });

  return { events };
}

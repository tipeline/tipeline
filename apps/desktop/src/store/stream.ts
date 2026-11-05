import { defineStore } from 'pinia';
import { ref } from 'vue';

export type StreamEventType = 'start' | 'action' | 'action_error' | 'end' | 'error' | 'end_all' | 'paused';

export interface StreamEvent {
  type: StreamEventType;
  correlationId: string;
  taskIdentifier: string;
  pipelineIdentifier: string;
  timestamp: number;
  data?: any;
  error?: string | any;
}

const MAX_EVENTS = 500;

/**
 * Global log of all stream events across all executions.
 * Written to by useStream(); read by useStreamListener() and any component
 * that needs cross-execution visibility (e.g. HomeRecentActivity).
 */
export const useStreamStore = defineStore('stream', () => {
  const events = ref<StreamEvent[]>([]);

  function addEvent(event: StreamEvent) {
    events.value.push(event);
    if (events.value.length > MAX_EVENTS) {
      events.value.splice(0, events.value.length - MAX_EVENTS);
    }
  }

  function clearAll() {
    events.value = [];
  }

  /** Drops events for pipelines that no longer exist (e.g. after a "clear history"), so
   *  views that reconstruct runs from this log (HomeRecentActivity, Activity) stop
   *  resurrecting deleted runs. */
  function removeEventsForPipelines(pipelineIdentifiers: string[]) {
    if (pipelineIdentifiers.length === 0) return;
    const toRemove = new Set(pipelineIdentifiers);
    events.value = events.value.filter((e) => !toRemove.has(e.pipelineIdentifier));
  }

  /** Drops every event of a deleted workflow's runs. Only some events carry the workflow
   *  (start/end), so its runs are found through those and removed whole. */
  function removeEventsForTask(taskIdentifier: string) {
    const runs = events.value.filter((e) => e.taskIdentifier === taskIdentifier).map((e) => e.pipelineIdentifier);
    removeEventsForPipelines(runs.filter(Boolean));
  }

  return { events, addEvent, clearAll, removeEventsForPipelines, removeEventsForTask };
});

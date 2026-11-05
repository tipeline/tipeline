// Loads the runs a run's sub-workflow steps started and attaches them to those steps
// (see utils/childRuns.ts): one run per step (the failed or last one, when the step ran
// in a loop), and theirs in turn. Runs started from this window follow along live.
import { computed, reactive, ref, watch, type Ref } from 'vue';
import { generateIdentifier } from '@tipeline/utils';
import { useStreamStore } from '@/store/stream';
import { usePipelineResult } from '@/composables/usePipelineResult';
import { updateTimelineWithEvents } from '@/composables/useTimelineUpdater';
import {
  attachChildRuns,
  childRunsFromEvents,
  mergeChildRuns,
  type ChildRun,
  type ChildRunDetail,
} from '@/utils/childRuns';
import { SEND } from '@/ipc-channels';

export function useChildRuns(pipelineId: string, result: Ref<any>, timelineActions: Ref<any[]>) {
  const store = useStreamStore();
  const details = reactive(new Map<string, ChildRunDetail>());
  // The statuses each run was already loaded for. A live run's list status stays
  // "running" until the run reloads, so without this it would be loaded again and again.
  const requested = new Map<string, Set<string>>();
  const version = ref(0);

  const eventsOf = (identifier: string) => store.events.filter((e) => e.pipelineIdentifier === identifier);
  const liveChildren = (identifier: string) => childRunsFromEvents(store.events, identifier);

  async function load(run: ChildRun) {
    const asked = requested.get(run.identifier) ?? new Set<string>();
    if (asked.has(run.status)) return;
    asked.add(run.status);
    requested.set(run.identifier, asked);
    try {
      const response = await window.ipcRenderer.invoke(SEND.PIPELINE_DETAIL, {
        correlationId: generateIdentifier(),
        payload: { pipelineIdentifier: run.identifier },
      });
      if (!response) return;
      const steps = ref<any[]>([]);
      usePipelineResult(response, steps);
      const own = eventsOf(run.identifier);
      if (own.length && response.status === 'running') updateTimelineWithEvents(steps.value, own);
      details.set(run.identifier, {
        status: response.status,
        actions: steps.value,
        children: response.children ?? [],
      });
      asked.add(response.status);
      version.value++;
    } catch {
      asked.delete(run.status);
    }
  }

  function detailOf(identifier: string): ChildRunDetail | undefined {
    const detail = details.get(identifier);
    if (!detail) return undefined;
    return { ...detail, children: mergeChildRuns(detail.children, liveChildren(identifier)) };
  }

  const children = computed(() => mergeChildRuns(result.value?.children, liveChildren(pipelineId)));

  function attach() {
    if (!timelineActions.value?.length) return;
    const missing = attachChildRuns(timelineActions.value, children.value, detailOf);
    missing.forEach(load);
  }

  watch([timelineActions, children, version], attach, { immediate: true });

  // A sub-workflow run started from this window: its steps follow its events, and it's
  // loaded again from the database once it ends.
  // The store keeps its last 500 events, so new ones are those after the last one seen.
  let last: unknown = null;
  watch(
    () => store.events[store.events.length - 1],
    () => {
      const from = last ? store.events.indexOf(last as any) + 1 : 0;
      const fresh = store.events.slice(from);
      last = store.events[store.events.length - 1] ?? null;
      for (const event of fresh) {
        const detail = details.get(event.pipelineIdentifier);
        if (!detail) continue;
        if (event.type === 'end' || event.type === 'error') {
          requested.delete(event.pipelineIdentifier);
          load({ identifier: event.pipelineIdentifier, status: 'ended' } as ChildRun);
        } else {
          updateTimelineWithEvents(detail.actions, eventsOf(event.pipelineIdentifier));
        }
      }
    }
  );

  return { children };
}

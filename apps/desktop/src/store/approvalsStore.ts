import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { PendingApproval } from '@/components/approvals/ApprovalCard.vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useConnectionStore } from '@/store/connectionStore';
import { useStreamStore } from '@/store/stream';

const POLL_MS = 30_000;

export interface ApprovalNotifier {
  /** Called with the requests that appeared since the last check (never on the first one). */
  (items: PendingApproval[]): void;
}

/**
 * Every run waiting for approval in the active workspace: the Approvals page, the sidebar
 * badge and desktop notifications read from here. Polls while started, and also checks
 * right after any run ends (it may have just paused). On a server workspace the list only
 * has runs this user may see, each with `canDecide`; the badge and notifications count
 * only those they may decide.
 */
export const useApprovalsStore = defineStore('approvals', () => {
  const items = ref<PendingApproval[]>([]);
  const loaded = ref(false);
  const error = ref('');
  const deciding = ref<string | null>(null);
  const actionable = computed(() =>
    items.value.filter((i) => i.canDecide !== false)
  );
  const count = computed(() => actionable.value.length);

  const connection = useConnectionStore();

  let known: Set<string> | null = null;
  let notifier: ApprovalNotifier | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopWatching: (() => void) | null = null;
  let inFlight: Promise<void> | null = null;

  async function load() {
    try {
      const fresh = await invokeCore<PendingApproval[]>(SEND.APPROVAL_LIST, {});
      const added = known
        ? fresh.filter(
            (i) => !known!.has(i.pipelineIdentifier) && i.canDecide !== false
          )
        : [];
      known = new Set(fresh.map((i) => i.pipelineIdentifier));
      items.value = fresh;
      error.value = '';
      if (added.length) notifier?.(added);
    } catch (e: any) {
      error.value = e?.message ?? String(e);
    } finally {
      loaded.value = true;
    }
  }

  /** Re-reads the list (calls made while one is in flight share it). */
  function refresh(): Promise<void> {
    inFlight ??= load().finally(() => (inFlight = null));
    return inFlight;
  }

  function start(onNew?: ApprovalNotifier) {
    notifier = onNew ?? null;
    if (timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
    const stream = useStreamStore();
    const stopEnds = watch(
      () => stream.events.length,
      () => {
        const latest = stream.events[stream.events.length - 1];
        if (latest && (latest.type === 'end' || latest.type === 'end_all'))
          void refresh();
      }
    );
    // Another workspace means another list; don't announce its existing requests as new.
    const stopWorkspace = watch(
      () => connection.activeId,
      () => {
        known = null;
        items.value = [];
        loaded.value = false;
        void refresh();
      }
    );
    stopWatching = () => {
      stopEnds();
      stopWorkspace();
    };
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    stopWatching?.();
    stopWatching = null;
    notifier = null;
  }

  async function decide(
    item: PendingApproval,
    approved: boolean,
    comment: string
  ) {
    deciding.value = item.pipelineIdentifier;
    try {
      await invokeCore(SEND.APPROVAL_DECIDE, {
        pipelineIdentifier: item.pipelineIdentifier,
        approved,
        comment,
        decidedBy: 'desktop',
      });
      items.value = items.value.filter(
        (i) => i.pipelineIdentifier !== item.pipelineIdentifier
      );
      known?.delete(item.pipelineIdentifier);
    } finally {
      deciding.value = null;
      void refresh();
    }
  }

  return {
    items,
    actionable,
    loaded,
    error,
    deciding,
    count,
    refresh,
    start,
    stop,
    decide,
  };
});

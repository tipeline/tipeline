import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useConnectionStore } from '@/store/connectionStore';

const POLL_MS = 60_000;

export type HubItemType = 'task' | 'app' | 'plugin';

export interface HubUpdateEvent {
  id: number;
  item_type: HubItemType;
  item_identifier: string;
  item_name: string | null;
  hub_name: string | null;
  kind: 'updated' | 'major_waiting' | 'update_available' | 'older_listed' | 'blocked' | 'not_bumped' | 'failed';
  from_version: string | null;
  to_version: string | null;
  message: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * What hub updates did and which need the user: the Hub page's Updates tab, the sidebar
 * badge and the notifications read from here. Updates happen in Core with no client
 * attached, so this polls the log rather than waiting to be told.
 */
export const useHubUpdatesStore = defineStore('hubUpdates', () => {
  const events = ref<HubUpdateEvent[]>([]);
  const loaded = ref(false);
  const needsYou = computed(() => events.value.filter((e) => e.kind !== 'updated'));
  const history = computed(() => events.value.filter((e) => e.kind === 'updated'));
  const unread = computed(() => events.value.filter((e) => !e.read_at).length);

  const connection = useConnectionStore();

  let known: Set<number> | null = null;
  let notifier: ((added: HubUpdateEvent[]) => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopWatching: (() => void) | null = null;

  async function refresh() {
    try {
      const fresh = (await invokeCore<HubUpdateEvent[]>(SEND.HUB_UPDATE_EVENTS)) ?? [];
      // Unread only: an older request that came back after being seen isn't news.
      const added = known ? fresh.filter((e) => !known!.has(e.id) && !e.read_at) : [];
      known = new Set(fresh.map((e) => e.id));
      events.value = fresh;
      if (added.length) notifier?.(added);
    } catch {
      // Keep the last known list on a transient IPC failure.
    } finally {
      loaded.value = true;
    }
  }

  async function markAllRead() {
    if (!unread.value) return;
    await invokeCore(SEND.HUB_UPDATE_EVENTS_READ);
    await refresh();
  }

  function start(onNew?: (added: HubUpdateEvent[]) => void) {
    notifier = onNew ?? null;
    if (timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
    // Another workspace means another log; don't announce what it already had as new.
    stopWatching = watch(
      () => connection.activeId,
      () => {
        known = null;
        events.value = [];
        loaded.value = false;
        void refresh();
      }
    );
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    stopWatching?.();
    stopWatching = null;
    notifier = null;
  }

  return { events, loaded, needsYou, history, unread, refresh, markAllRead, start, stop };
});

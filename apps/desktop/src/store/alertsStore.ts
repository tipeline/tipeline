import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useConnectionStore } from '@/store/connectionStore';
import { useStreamStore } from '@/store/stream';

const POLL_MS = 30_000;

export type AlertLevel = 'info' | 'warning' | 'critical';

/** An alert raised by a workflow (Core.alertList). */
export interface AlertItem {
  id: string;
  taskIdentifier: string;
  workflowName: string | null;
  pipelineIdentifier: string | null;
  key: string;
  title: string;
  message: string | null;
  level: AlertLevel;
  status: 'open' | 'dismissed' | 'resolved';
  count: number;
  firstRaisedAt: string;
  lastRaisedAt: string;
  closedAt: string | null;
  closedBy: string | null;
}

const LEVEL_RANK: Record<AlertLevel, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/** Warning and critical alerts count in badges and notify; info ones are only listed. */
export const isLoud = (alert: Pick<AlertItem, 'level'>) =>
  alert.level !== 'info';

export interface AlertNotifier {
  /**
   * Called with the loud alerts that appeared, or got louder, since the last check
   * (never on the first one). Raising the same alert again doesn't notify again.
   */
  (items: AlertItem[]): void;
}

/**
 * Open alerts in the active workspace: Needs you, its badge and notifications read from
 * here. Polls while started and checks again right after any run ends (it may have just
 * raised one). On a server workspace the list only has alerts this user may see.
 */
export const useAlertsStore = defineStore('alerts', () => {
  const items = ref<AlertItem[]>([]);
  const loaded = ref(false);
  const error = ref('');
  const dismissing = ref<string | null>(null);
  const loud = computed(() => items.value.filter(isLoud));
  const count = computed(() => loud.value.length);

  const connection = useConnectionStore();

  // id → level last seen, so a warning that turns critical is announced again.
  let known: Map<string, AlertLevel> | null = null;
  let notifier: AlertNotifier | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopWatching: (() => void) | null = null;
  let inFlight: Promise<void> | null = null;

  async function load() {
    try {
      const fresh = await invokeCore<AlertItem[]>(SEND.ALERT_LIST, {});
      const added = known
        ? fresh.filter((a) => {
            if (!isLoud(a)) return false;
            const before = known!.get(a.id);
            return (
              before === undefined || LEVEL_RANK[a.level] > LEVEL_RANK[before]
            );
          })
        : [];
      known = new Map(fresh.map((a) => [a.id, a.level]));
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

  function start(onNew?: AlertNotifier) {
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
    // Another workspace means another list; don't announce its existing alerts as new.
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

  /** Acknowledges an alert: it leaves the list and stays quiet until its workflow resolves it. */
  async function dismiss(alert: Pick<AlertItem, 'id'>) {
    dismissing.value = alert.id;
    try {
      await invokeCore(SEND.ALERT_DISMISS, {
        id: alert.id,
        dismissedBy: 'desktop',
      });
      items.value = items.value.filter((a) => a.id !== alert.id);
    } finally {
      dismissing.value = null;
      void refresh();
    }
  }

  /**
   * A deleted workflow takes its alerts with it (Core deletes them): drop them now
   * instead of at the next check, so Needs you and the badges don't show them for 30s.
   */
  function forgetTask(taskIdentifier: string) {
    items.value = items.value.filter((a) => a.taskIdentifier !== taskIdentifier);
    void refresh();
  }

  /** Acknowledges several open alerts at once (the Alerts page's bulk Dismiss). */
  async function dismissMany(ids: string[]) {
    if (!ids.length) return;
    try {
      await invokeCore(SEND.ALERT_DISMISS, { ids, dismissedBy: 'desktop' });
      const gone = new Set(ids);
      items.value = items.value.filter((a) => !gone.has(a.id));
    } finally {
      void refresh();
    }
  }

  /**
   * Closes open or dismissed alerts because the person fixed the problem: the next raise
   * with the same key is a new alert, announced again.
   */
  async function resolveMany(ids: string[]) {
    if (!ids.length) return;
    try {
      await invokeCore(SEND.ALERT_RESOLVE, { ids, resolvedBy: 'desktop' });
      const gone = new Set(ids);
      items.value = items.value.filter((a) => !gone.has(a.id));
    } finally {
      void refresh();
    }
  }

  /** Puts several dismissed alerts back (one call each), without announcing them. */
  async function reopenMany(alerts: (Pick<AlertItem, 'id'> & Partial<Pick<AlertItem, 'level'>>)[]) {
    try {
      for (const alert of alerts) {
        await invokeCore(SEND.ALERT_REOPEN, { id: alert.id });
        known?.set(alert.id, alert.level ?? 'critical');
      }
    } finally {
      void refresh();
    }
  }

  /**
   * Puts a dismissed alert back in Needs you. The person did that themselves, so it isn't
   * announced as a new alert (no toast, no system notification).
   */
  async function reopen(alert: Pick<AlertItem, 'id'> & Partial<Pick<AlertItem, 'level'>>) {
    await invokeCore(SEND.ALERT_REOPEN, { id: alert.id });
    known?.set(alert.id, alert.level ?? 'critical');
    void refresh();
  }

  return {
    items,
    loud,
    loaded,
    error,
    dismissing,
    count,
    refresh,
    start,
    stop,
    dismiss,
    dismissMany,
    reopen,
    reopenMany,
    resolveMany,
    forgetTask,
  };
});

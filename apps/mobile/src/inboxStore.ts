import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useSession } from './session';
import { useApprovals } from './approvalsStore';
import { loadServerList, saveServerList } from './storage';
import {
  countsAlert,
  dismissedEntry,
  failedRunKey,
  failingWorkflows,
  missedKey,
  missedSchedules,
  openAlerts,
  type AlertItem,
  type ScheduleItem,
  type WorkflowWithLastRun,
} from './lib/inbox';
import { isListed } from './lib/workflows';

const POLL_MS = 30_000;
const RUN_ENDS = new Set(['onTaskEnd', 'onTaskEndAll', 'onTaskError', 'onAlertDismiss', 'onApprovalDecide', 'onPipelineCancel']);

/**
 * What only this person can act on, like Desktop's "Needs you": approvals they may decide,
 * open alerts, workflows whose latest run failed and scheduled runs that didn't happen.
 * Failures and missed runs are dismissed on this phone; alerts are dismissed on the Server.
 * Also holds the workflow and schedule lists Home reads.
 */
export const useInbox = defineStore('mobile-inbox', () => {
  const session = useSession();
  const approvals = useApprovals();

  const workflows = ref<WorkflowWithLastRun[]>([]);
  const schedules = ref<ScheduleItem[]>([]);
  const alerts = ref<AlertItem[]>([]);
  const loaded = ref(false);
  const error = ref('');
  const dismissedList = ref<string[]>([]);

  const dismissed = (key: string, occurrence: string) => dismissedList.value.includes(dismissedEntry(key, occurrence));
  function remember(entry: string) {
    // Only the latest few hundred: older failures are long replaced by newer runs.
    dismissedList.value = [...dismissedList.value.filter((e) => e !== entry), entry].slice(-300);
    saveServerList('dismissed', session.serverUrl, dismissedList.value);
  }

  const failing = computed(() => failingWorkflows(workflows.value.filter(isListed), dismissed));
  const missed = computed(() => missedSchedules(schedules.value, dismissed));
  const shownAlerts = computed(() => openAlerts(alerts.value));
  const count = computed(
    () => approvals.count + alerts.value.filter(countsAlert).length + failing.value.length + missed.value.length
  );

  let inFlight: Promise<void> | null = null;
  async function load() {
    const api = session.api();
    const [w, s, a] = await Promise.allSettled([
      api.request<WorkflowWithLastRun[]>('taskList'),
      api.request<ScheduleItem[]>('scheduleList'),
      api.request<AlertItem[]>('alertList', {}),
    ]);
    if (w.status === 'fulfilled') workflows.value = w.value ?? [];
    if (s.status === 'fulfilled') schedules.value = s.value ?? [];
    if (a.status === 'fulfilled') alerts.value = a.value ?? [];
    const failed = [w, s, a].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    error.value = failed ? (failed.reason as Error).message : '';
    loaded.value = true;
  }
  function refresh(): Promise<void> {
    if (!session.client) return Promise.resolve();
    inFlight ??= Promise.all([load(), approvals.refresh()])
      .then(() => {})
      .finally(() => (inFlight = null));
    return inFlight;
  }

  function dismissFailure(w: WorkflowWithLastRun) {
    remember(dismissedEntry(w.identifier, failedRunKey(w)));
  }
  function dismissMissed(s: ScheduleItem) {
    if (s.missedAt) remember(dismissedEntry(missedKey(s), s.missedAt));
  }
  /** Recorded on the Server under this user; it leaves everyone's list. */
  async function dismissAlert(alert: AlertItem) {
    await session.api().request('alertDismiss', { id: alert.id });
    alerts.value = alerts.value.map((a) => (a.id === alert.id ? { ...a, status: 'dismissed' } : a));
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopMessages: (() => void) | null = null;
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    stopMessages?.();
    stopMessages = null;
  }
  watch(
    () => session.client,
    (client) => {
      stop();
      workflows.value = [];
      schedules.value = [];
      alerts.value = [];
      loaded.value = false;
      error.value = '';
      dismissedList.value = client ? loadServerList('dismissed', session.serverUrl) : [];
      if (!client) return;
      void refresh();
      timer = setInterval(() => void refresh(), POLL_MS);
      stopMessages = client.subscribe((message) => {
        if (RUN_ENDS.has(message.event)) void refresh();
      });
    },
    { immediate: true }
  );
  watch(
    () => session.status,
    (status, before) => {
      if (status === 'open' && before && before !== 'open') void refresh();
    }
  );

  return {
    workflows,
    schedules,
    alerts: shownAlerts,
    failing,
    missed,
    count,
    loaded,
    error,
    refresh,
    dismissFailure,
    dismissMissed,
    dismissAlert,
  };
});

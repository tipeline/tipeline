<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useColorMode } from '@vueuse/core';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import { CircleAlert, Clock, Settings, ShieldCheck, Sparkles, Square, TrendingUp, CheckIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useQuery } from '@/composables/useQuery';
import { useInbox } from '@/composables/useInbox';
import { useTaskExecution } from '@/composables/useTaskExecution';
import { applyLocaleFromStorage } from '@/composables/useLocale';
import { useStreamStore, type StreamEvent, type StreamEventType } from '@/store/stream';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useAlertsStore } from '@/store/alertsStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useCancelStore } from '@/store/cancelStore';
import { formatDuration } from '@/utils/formatDuration';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import {
  firstOf,
  needTitle,
  nextScheduled,
  NEEDS_LIMIT,
  RUNNING_LIMIT,
  runPath,
  trayNeeds,
  type RunningRun,
  type TrayKind,
  type TrayNeed,
} from './trayItems';

// The menu bar / tray popover (design A): what needs the user, most urgent first, with
// the thing to do right there; what's running, with Stop; when the next schedule runs.
// Everything else opens the main window (TRAY_OPEN). It reports its height so the window
// fits it, and the badge count + Linux menu entries (TRAY_STATE).

useColorMode();
applyLocaleFromStorage();

const { t } = useI18n();
const streamStore = useStreamStore();
const approvals = useApprovalsStore();
const alerts = useAlertsStore();
const connection = useConnectionStore();
const cancelStore = useCancelStore();
const { executeTask } = useTaskExecution();

const { data: tasks, refetch: refetchTasks } = useQuery<TaskItem[]>(SEND.TASK_LIST, {});
const { data: schedules, refetch: refetchSchedules } = useQuery<ScheduleItem[]>(SEND.SCHEDULE_LIST, {});
const inbox = useInbox(tasks, schedules);

const running = ref<RunningRun[]>([]);
async function loadRunning() {
  try {
    running.value = await invokeCore<RunningRun[]>(SEND.PIPELINE_LIST, { limit: 20, offset: 0, status: 'running' });
  } catch {
    running.value = [];
  }
}

const coreUp = ref(true);
const now = ref(Date.now());

// ---- What needs you ----------------------------------------------------------------

const needs = computed(() =>
  trayNeeds({
    approvals: inbox.approvals.value,
    alerts: inbox.alerts.value,
    failing: inbox.failing.value,
    missed: inbox.missed.value,
  })
);
const needsShown = computed(() => firstOf(needs.value, NEEDS_LIMIT));
const runningShown = computed(() => firstOf(running.value, RUNNING_LIMIT));

const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : '');
const clock = (iso: string) => (isToday(new Date(iso)) ? format(new Date(iso), 'HH:mm') : format(new Date(iso), 'EEE HH:mm'));

function failedInARow(task: TaskItem): number {
  const runs = task.recent_runs ?? [];
  let n = 0;
  while (n < runs.length && runs[n] === 'failed') n++;
  return Math.max(1, n);
}

/** The grey line under a need's title: where it came from and when. */
function detail(need: TrayNeed): string {
  switch (need.kind) {
    case 'approval':
      return [need.item.workflowName, ago(need.at)].join(' · ');
    case 'alert': {
      const parts = [need.item.workflowName ?? need.item.taskIdentifier];
      if (need.item.count > 1) parts.push(t('dashboard.needs.alertRepeated', { n: need.item.count, time: clock(need.item.firstRaisedAt) }));
      else parts.push(ago(need.at));
      return parts.join(' · ');
    }
    case 'failed': {
      const times = failedInARow(need.item);
      return [times > 1 ? t('dashboard.needs.failedTimes', { n: times }) : t('dashboard.needs.failedOnce'), ago(need.at)].join(' · ');
    }
    case 'missed':
      return t('tray.missedAt', { time: clock(need.item.missedAt!) });
  }
}

// Same colours as the dashboard's Needs you: approval purple, alert orange, failed red, missed blue.
const tone: Record<TrayKind, { tile: string; text: string }> = {
  approval: { tile: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', text: 'text-violet-700 dark:text-violet-300' },
  alert: { tile: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', text: 'text-orange-700 dark:text-orange-300' },
  failed: { tile: 'bg-red-500/10 text-red-700 dark:text-red-400', text: 'text-red-700 dark:text-red-400' },
  missed: { tile: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', text: 'text-blue-700 dark:text-blue-300' },
};
const icon: Record<TrayKind, unknown> = { approval: ShieldCheck, alert: TrendingUp, failed: CircleAlert, missed: Clock };

function kindLabel(need: TrayNeed): string {
  if (need.kind === 'alert' && need.item.level === 'critical') return t('tray.critical');
  return t(`dashboard.needs.kind.${need.kind}`);
}

const busy = ref<string | null>(null);
async function act(key: string, work: () => unknown) {
  busy.value = key;
  try {
    await work();
  } finally {
    busy.value = null;
  }
}

function open(path?: string) {
  void window.ipcRenderer.invoke(SEND.TRAY_OPEN, path);
}

// Ask: the main window comes forward with the Assistant panel open, ready to type in.
function openAssistant() {
  void window.ipcRenderer.invoke(SEND.TRAY_ASSISTANT);
}

function runNow(schedule: ScheduleItem) {
  executeTask(schedule.taskIdentifier, JSON.parse(JSON.stringify(schedule.variables ?? {})));
  inbox.dismissMissed(schedule);
}

// ---- Running -------------------------------------------------------------------------

const confirmStop = ref<string | null>(null);
async function stop(run: RunningRun) {
  confirmStop.value = null;
  try {
    await cancelStore.cancel({ pipelineIdentifier: run.identifier });
  } finally {
    void loadRunning();
  }
}
const isStopping = (run: RunningRun) => cancelStore.isCanceling({ pipelineIdentifier: run.identifier });

const next = computed(() => nextScheduled(schedules.value ?? []));
function nextWhen(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isTomorrow(date)) return t('dashboard.needs.tomorrowAt', { time: format(date, 'HH:mm') });
  return format(date, 'EEE HH:mm');
}

// ---- Refreshing ------------------------------------------------------------------------

function refreshAll() {
  void refetchTasks();
  void refetchSchedules();
  void loadRunning();
  void approvals.refresh();
  void alerts.refresh();
}

function onBroadcast(_: unknown, msg: any) {
  const event: StreamEvent = {
    type: msg.type as StreamEventType,
    correlationId: msg.correlationId ?? '',
    taskIdentifier: msg.data?.taskIdentifier ?? '',
    pipelineIdentifier: msg.data?.pipelineIdentifier ?? '',
    timestamp: Date.now(),
    data: msg.data,
  };
  streamStore.addEvent(event);
  if (event.type === 'start') void loadRunning();
  if (event.type === 'end' || event.type === 'end_all' || event.type === 'error') {
    void loadRunning();
    void refetchTasks();
  }
}

// Something changed in another window (a workflow deleted, an approval decided…): re-read
// everything, once for a burst of changes.
let changedTimer: ReturnType<typeof setTimeout> | null = null;
function onDataChanged() {
  if (changedTimer) clearTimeout(changedTimer);
  changedTimer = setTimeout(refreshAll, 250);
}

async function onWorkspaceChanged() {
  await connection.load();
  refreshAll();
}
const onShown = () => {
  confirmStop.value = null;
  refreshAll();
};
const onCoreDown = () => (coreUp.value = false);
const onCoreBack = () => {
  coreUp.value = true;
  refreshAll();
};
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') void window.ipcRenderer.invoke(SEND.TRAY_HIDE);
}

// ---- Size and state for the main process ----------------------------------------------

const header = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const footer = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;
// The height everything would need: the list's content, not its box (which fills the window).
function reportHeight() {
  const content = body.value?.firstElementChild as HTMLElement | null | undefined;
  const height = (header.value?.offsetHeight ?? 0) + (content?.offsetHeight ?? 0) + (footer.value?.offsetHeight ?? 0);
  if (height) window.ipcRenderer.send(SEND.TRAY_RESIZE, height);
}

const isMac = navigator.userAgent.includes('Mac');
const trayState = computed(() => ({
  count: inbox.count.value,
  needs: needsShown.value.shown.map((need) => ({ label: `${kindLabel(need)}: ${needTitle(need)}`, path: need.path })),
  needsMore: needsShown.value.more,
  running: runningShown.value.shown.map((run) => ({ label: run.task_name, path: runPath(run.task_identifier, run.identifier) })),
  runningMore: runningShown.value.more,
  labels: {
    open: t('tray.open'),
    quit: t('tray.quit'),
    needsTitle: t('dashboard.needs.title'),
    runningTitle: t('tray.running'),
    allClear: t('tray.allClear'),
    seeAll: t('tray.seeAll'),
    moreRunning: t('tray.moreRunningMenu'),
    tooltip: 'Tipeline',
    hintTitle: t('tray.hintTitle'),
    hintBody: t(isMac ? 'tray.hintBodyMac' : 'tray.hintBody'),
  },
}));
watch(trayState, (value) => window.ipcRenderer.send(SEND.TRAY_STATE, JSON.parse(JSON.stringify(value))), {
  immediate: true,
});

let ticker: ReturnType<typeof setInterval> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  window.ipcRenderer.on('stream:broadcast', onBroadcast);
  window.ipcRenderer.on('workspace-changed', onWorkspaceChanged);
  window.ipcRenderer.on('tray:shown', onShown);
  window.ipcRenderer.on('data:changed', onDataChanged);
  window.ipcRenderer.on('core:disconnected', onCoreDown);
  window.ipcRenderer.on('core:reconnected', onCoreBack);
  window.addEventListener('keydown', onKey);
  // The badge needs the lists even while nobody opens the popover. The main window
  // announces new approvals and alerts; this one only keeps count.
  approvals.start();
  alerts.start();
  ticker = setInterval(() => (now.value = Date.now()), 1000);
  poller = setInterval(refreshAll, 60_000);
  observer = new ResizeObserver(reportHeight);
  for (const el of [header.value, body.value?.firstElementChild, footer.value]) if (el) observer.observe(el as Element);
  await connection.load().catch(() => undefined);
  void loadRunning();
  await nextTick();
  reportHeight();
});

onUnmounted(() => {
  window.ipcRenderer.off('stream:broadcast', onBroadcast);
  window.ipcRenderer.off('workspace-changed', onWorkspaceChanged);
  window.ipcRenderer.off('tray:shown', onShown);
  window.ipcRenderer.off('data:changed', onDataChanged);
  window.ipcRenderer.off('core:disconnected', onCoreDown);
  window.ipcRenderer.off('core:reconnected', onCoreBack);
  window.removeEventListener('keydown', onKey);
  approvals.stop();
  alerts.stop();
  if (ticker) clearInterval(ticker);
  if (poller) clearInterval(poller);
  observer?.disconnect();
});

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden bg-card text-card-foreground text-[13px] select-none">
    <!-- Header -->
    <header ref="header" class="flex items-center gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
      <svg width="18" height="18" viewBox="0 0 46 48" aria-hidden="true" class="shrink-0 fill-current">
        <rect x="0" y="5" width="46" height="11.5" rx="2" />
        <rect x="9.2" y="18.8" width="27.6" height="11.5" rx="2" />
        <rect x="13.8" y="32.6" width="18.4" height="11.5" rx="2" />
      </svg>
      <span class="text-sm font-semibold">Tipeline</span>
      <span class="flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
        <span class="w-[7px] h-[7px] rounded-full" :class="coreUp ? 'bg-emerald-500' : 'bg-red-500'" />
        {{ coreUp ? t('tray.coreRunning') : t('tray.coreStopped') }}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="ml-auto size-7"
        :aria-label="t('tray.settings')"
        :title="t('tray.settings')"
        @click="open('/settings')"
      >
        <Settings class="size-4 text-muted-foreground" aria-hidden="true" />
      </Button>
    </header>

    <!-- Lists (scroll when the popover reaches its maximum height) -->
    <div ref="body" class="flex-1 min-h-0 overflow-y-auto">
      <div>
        <section v-if="needs.length" aria-labelledby="tray-needs">
          <div class="flex items-center gap-1.5 px-3.5 pt-3 pb-1">
            <h2 id="tray-needs" :class="sectionTitle" class="m-0">{{ t('dashboard.needs.title') }}</h2>
            <span v-if="inbox.count.value" class="text-[11px] font-semibold rounded-full px-1.5 bg-red-600 text-white">
              {{ inbox.count.value }}
            </span>
            <button type="button" class="ml-auto text-xs text-primary hover:underline" @click="open('/')">
              {{ needsShown.more ? t('tray.seeAllCount', { n: needs.length }) : t('tray.seeAll') }}
            </button>
          </div>
          <ul class="m-0 px-2 py-1 list-none flex flex-col">
            <li v-for="need in needsShown.shown" :key="need.key" class="flex gap-2.5 px-1.5 py-2 rounded-lg">
              <span class="size-8 shrink-0 rounded-lg flex items-center justify-center" :class="tone[need.kind].tile">
                <component :is="icon[need.kind]" class="size-4" aria-hidden="true" />
              </span>
              <div class="flex-1 min-w-0">
                <button
                  type="button"
                  class="block max-w-full text-left font-semibold truncate hover:underline"
                  @click="open(need.path)"
                >
                  {{ needTitle(need) }}
                </button>
                <p class="m-0 mt-0.5 text-xs text-muted-foreground truncate">
                  <span class="font-medium" :class="tone[need.kind].text">{{ kindLabel(need) }}</span>
                  · {{ detail(need) }}
                </p>
                <div class="flex gap-1.5 mt-1.5">
                  <template v-if="need.kind === 'approval'">
                    <Button
                      size="sm"
                      class="h-[26px] px-2.5 text-xs"
                      :disabled="busy === need.key"
                      @click="act(need.key, () => approvals.decide(need.item, true, ''))"
                    >
                      {{ t('tray.approve') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      class="h-[26px] px-2.5 text-xs"
                      :disabled="busy === need.key"
                      @click="act(need.key, () => approvals.decide(need.item, false, ''))"
                    >
                      {{ t('tray.reject') }}
                    </Button>
                  </template>
                  <template v-else-if="need.kind === 'alert'">
                    <Button size="sm" variant="outline" class="h-[26px] px-2.5 text-xs" @click="open(need.path)">
                      {{ need.item.pipelineIdentifier ? t('dashboard.needs.seeRun') : t('dashboard.needs.openWorkflow') }}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-[26px] px-2.5 text-xs text-muted-foreground"
                      :disabled="busy === need.key"
                      @click="act(need.key, () => inbox.dismissAlert(need.item))"
                    >
                      {{ t('dashboard.needs.dismiss') }}
                    </Button>
                  </template>
                  <template v-else-if="need.kind === 'failed'">
                    <Button size="sm" variant="outline" class="h-[26px] px-2.5 text-xs" @click="open(need.path)">
                      {{ t('dashboard.needs.openRun') }}
                    </Button>
                    <Button size="sm" variant="ghost" class="h-[26px] px-2.5 text-xs text-muted-foreground" @click="inbox.dismiss(need.item)">
                      {{ t('dashboard.needs.dismiss') }}
                    </Button>
                  </template>
                  <template v-else>
                    <Button size="sm" variant="outline" class="h-[26px] px-2.5 text-xs" @click="runNow(need.item)">
                      {{ t('dashboard.needs.runNow') }}
                    </Button>
                    <Button size="sm" variant="ghost" class="h-[26px] px-2.5 text-xs text-muted-foreground" @click="inbox.dismissMissed(need.item)">
                      {{ t('dashboard.needs.dismiss') }}
                    </Button>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <div v-else class="flex items-center gap-2.5 px-3.5 py-3">
          <span class="size-8 shrink-0 rounded-full flex items-center justify-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <CheckIcon class="size-4" aria-hidden="true" />
          </span>
          <span class="font-medium">{{ t('tray.allClear') }}</span>
        </div>

        <section v-if="running.length" aria-labelledby="tray-running" class="border-t border-border mt-1">
          <h2 id="tray-running" :class="sectionTitle" class="m-0 px-3.5 pt-3 pb-1">{{ t('tray.running') }}</h2>
          <ul class="m-0 px-3.5 pt-1 pb-2.5 list-none flex flex-col gap-2.5">
            <li v-for="run in runningShown.shown" :key="run.identifier">
              <div
                v-if="confirmStop === run.identifier"
                class="flex items-center gap-2 -mx-2 px-2 py-1.5 rounded-lg bg-red-500/10"
              >
                <span class="flex-1 min-w-0 truncate">{{ t('tray.stopConfirm', { name: run.task_name }) }}</span>
                <Button size="sm" variant="destructive" class="h-[26px] px-2.5 text-xs" @click="stop(run)">
                  {{ t('tray.stopYes') }}
                </Button>
                <Button size="sm" variant="outline" class="h-[26px] px-2.5 text-xs" @click="confirmStop = null">
                  {{ t('tray.keep') }}
                </Button>
              </div>
              <div v-else class="flex items-center gap-2.5">
                <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div class="flex justify-between gap-2">
                    <button
                      type="button"
                      class="font-medium truncate text-left hover:underline"
                      @click="open(runPath(run.task_identifier, run.identifier))"
                    >
                      {{ run.task_name }}
                    </button>
                    <span class="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {{ isStopping(run) ? t('tray.stopping') : formatDuration(now - Date.parse(run.started_at ?? '')) }}
                    </span>
                  </div>
                  <div class="h-1 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                    <div class="tray-progress h-1 w-1/3 rounded-full bg-blue-600 dark:bg-blue-400" />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-[26px]"
                  :disabled="isStopping(run)"
                  :aria-label="t('tray.stopRun', { name: run.task_name })"
                  :title="t('tray.stop')"
                  @click="confirmStop = run.identifier"
                >
                  <Square class="size-3 fill-current text-muted-foreground" aria-hidden="true" />
                </Button>
              </div>
            </li>
          </ul>
          <button
            v-if="runningShown.more"
            type="button"
            class="block px-3.5 pb-2.5 text-xs text-primary hover:underline"
            @click="open('/activity?status=running')"
          >
            {{ t('tray.moreRunning', { n: runningShown.more }) }}
          </button>
        </section>
      </div>
    </div>

    <!-- Footer -->
    <footer ref="footer" class="shrink-0">
      <div
        v-if="next"
        class="flex items-center gap-2 px-3.5 py-2 bg-muted/60 border-t border-border text-xs text-muted-foreground"
      >
        <Clock class="size-3.5" aria-hidden="true" />
        <span class="truncate">{{ t('tray.next', { name: next.taskName, when: nextWhen(next.nextRunAt!) }) }}</span>
      </div>
      <div class="flex gap-2 px-3.5 py-2.5 border-t border-border">
        <Button class="flex-1 h-8" @click="open('/')">{{ t('tray.open') }}</Button>
        <!-- The Assistant panel isn't offered on a remote workspace, so neither is the button. -->
        <Button
          v-if="!connection.isRemote"
          variant="outline"
          class="h-8 gap-1.5"
          :title="t('tray.askHint')"
          @click="openAssistant"
        >
          <Sparkles class="size-3.5" aria-hidden="true" />
          {{ t('tray.ask') }}
        </Button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Runs report no progress, so the bar only says "working". */
.tray-progress {
  animation: tray-progress 1.6s ease-in-out infinite;
}
@keyframes tray-progress {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tray-progress {
    animation: none;
    width: 100%;
    opacity: 0.4;
  }
}
</style>

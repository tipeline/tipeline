<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { BellRing, CalendarClockIcon } from 'lucide-vue-next';
import Dialog from '@/components/Dialog.vue';
import TaskSchedulesCard from '@/components/schedule/TaskSchedulesCard.vue';
import TaskAlertsCard from '@/components/task/TaskAlertsCard.vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useTimezone } from '@/composables/useTimezone';
import { useStreamListener } from '@/composables/useStreamListener';
import { useAlertsStore, type AlertItem } from '@/store/alertsStore';
import { formatStepDuration } from '@/utils/runSteps';
import {
  dotColors,
  nextRunText,
  runStrip,
  type TaskItem,
} from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';

/**
 * Four tiles at the top of a workflow's Overview that say whether it's healthy before
 * anything else: the last run, the last ten runs, the next scheduled run and open alerts.
 * Schedules and alerts open their full cards in a dialog.
 */
const props = defineProps<{
  taskIdentifier: string;
  taskName: string;
  draft: boolean;
}>();

const RUN_SLOTS = 10;

const { t } = useI18n();
const router = useRouter();
const { appTimezone } = useTimezone();
const { events } = useStreamListener();
const alertsStore = useAlertsStore();

const runs = ref<any[] | null>(null);
const schedules = ref<ScheduleItem[] | null>(null);
const alerts = ref<AlertItem[]>([]);
const schedulesOpen = ref(false);
const alertsOpen = ref(false);

async function loadRuns() {
  try {
    runs.value =
      (await invokeCore<any[]>(SEND.PIPELINE_LIST, {
        taskIdentifier: props.taskIdentifier,
        limit: RUN_SLOTS,
        offset: 0,
      })) ?? [];
  } catch {
    runs.value = [];
  }
}

async function loadSchedules() {
  try {
    const all = (await invokeCore<ScheduleItem[]>(SEND.SCHEDULE_LIST)) ?? [];
    schedules.value = all.filter(
      (s) => s.taskIdentifier === props.taskIdentifier
    );
  } catch {
    schedules.value = [];
  }
}

async function loadAlerts() {
  try {
    const all = await invokeCore<AlertItem[]>(SEND.ALERT_LIST, {
      taskIdentifier: props.taskIdentifier,
      includeClosed: true,
    });
    alerts.value = (all ?? []).filter((a) => a.status !== 'resolved');
  } catch {
    alerts.value = [];
  }
}

function reload() {
  void loadRuns();
  void loadSchedules();
  void loadAlerts();
}

watch(() => props.taskIdentifier, reload, { immediate: true });
// A run raised, resolved or dismissed an alert somewhere.
watch(
  () => alertsStore.items,
  () => void loadAlerts()
);
// Changes made in the dialogs show on the tiles once they close.
watch(schedulesOpen, (open) => !open && void loadSchedules());
watch(alertsOpen, (open) => !open && void loadAlerts());

// A scheduled or CLI run can start or end while the page is open.
let pending: ReturnType<typeof setTimeout> | null = null;
watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !['start', 'end', 'error'].includes(latest.type)) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      void loadRuns();
      void loadSchedules();
    }, 500);
  }
);
onUnmounted(() => {
  if (pending) clearTimeout(pending);
});

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  try {
    return format(
      new TZDate(new Date(date), appTimezone.value),
      'MMM d, HH:mm'
    );
  } catch {
    return date;
  }
}

function statusLabel(status: string | null | undefined) {
  const key = `taskHistory.${status ?? 'pending'}`;
  return t(key) !== key ? t(key) : (status ?? '');
}

function duration(run: any): string | null {
  const start = Date.parse(run?.started_at ?? '');
  const end = Date.parse(run?.finished_at ?? '');
  return Number.isFinite(start) && Number.isFinite(end)
    ? formatStepDuration(Math.max(0, end - start))
    : null;
}

const lastRun = computed(() => runs.value?.[0] ?? null);
const lastRunSub = computed(() => {
  if (!lastRun.value) return '';
  const took = duration(lastRun.value);
  return took
    ? `${formatDate(lastRun.value.started_at)} · ${took}`
    : formatDate(lastRun.value.started_at);
});

// The same bars as the workflows list's "Last 10 runs" column (newest run first in, oldest drawn left).
const RunBars = () =>
  runStrip(
    {
      recent_runs: (runs.value ?? []).map((r) => r.status),
    } as unknown as TaskItem,
    t
  );
const runCounts = computed(() => {
  const list = runs.value ?? [];
  return {
    total: list.length,
    completed: list.filter((r) => r.status === 'completed').length,
    failed: list.filter((r) => r.status === 'failed').length,
  };
});

const nextSchedule = computed(
  () =>
    (schedules.value ?? [])
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0] ??
    null
);
const schedulesOn = computed(
  () => (schedules.value ?? []).filter((s) => s.enabled).length
);

const openAlerts = computed(() =>
  alerts.value
    .filter((a) => a.status === 'open')
    .sort((a, b) => Date.parse(b.lastRaisedAt) - Date.parse(a.lastRaisedAt))
);
const acknowledged = computed(
  () => alerts.value.filter((a) => a.status === 'dismissed').length
);

function openRun(run: any) {
  router.push(`/tasks/${props.taskIdentifier}/pipelines/${run.identifier}`);
}

defineExpose({ reload });

const TILE =
  'flex flex-col gap-1 min-w-0 rounded-md border bg-card px-3.5 py-3 text-left';
const TILE_BUTTON = `${TILE} hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;
const LABEL =
  'text-xs font-medium text-muted-foreground uppercase tracking-wide';
const BIG = 'flex items-center gap-2 min-w-0 text-sm font-semibold';
const SUB = 'text-xs text-muted-foreground truncate';
</script>

<template>
  <!-- One root, so the spacing the Overview passes in lands on it (the dialogs teleport out). -->
  <div class="shrink-0" data-testid="overview-status-strip">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Last run -->
      <button
        v-if="lastRun"
        type="button"
        :class="TILE_BUTTON"
        data-testid="strip-last-run"
        @click="openRun(lastRun)"
      >
        <span :class="LABEL">{{ t('tasks.overview.lastRun') }}</span>
        <span :class="BIG">
          <span
            class="size-2 rounded-full shrink-0"
            :class="dotColors[lastRun.status] ?? 'bg-gray-400'"
          />
          <span class="truncate">{{ statusLabel(lastRun.status) }}</span>
        </span>
        <span :class="[SUB, 'tabular-nums']">{{ lastRunSub }}</span>
      </button>
      <div v-else :class="TILE" data-testid="strip-last-run">
        <span :class="LABEL">{{ t('tasks.overview.lastRun') }}</span>
        <span :class="[BIG, 'text-muted-foreground font-medium']">{{
          t('tasks.overview.notRunYet')
        }}</span>
        <span :class="SUB">{{
          runs === null ? '' : t('tasks.overview.strip.runToStart')
        }}</span>
      </div>

      <!-- Last ten runs: opens the Runs tab. -->
      <button
        type="button"
        :class="TILE_BUTTON"
        data-testid="strip-recent-runs"
        @click="router.push(`/tasks/${taskIdentifier}/pipelines`)"
      >
        <span :class="LABEL">{{ t('tasks.columns.recentRuns') }}</span>
        <RunBars />
        <span :class="SUB">
          <template v-if="runCounts.total">
            {{
              t('tasks.overview.strip.runCounts', {
                completed: runCounts.completed,
                failed: runCounts.failed,
              })
            }}
          </template>
          <template v-else>{{ t('tasks.runStrip.none') }}</template>
        </span>
      </button>

      <!-- Next run: opens the workflow's schedules. -->
      <button
        type="button"
        :class="TILE_BUTTON"
        data-testid="strip-next-run"
        @click="schedulesOpen = true"
      >
        <span :class="LABEL">{{ t('tasks.columns.nextRun') }}</span>
        <span v-if="nextSchedule" :class="BIG">
          <CalendarClockIcon class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate tabular-nums">{{
            nextRunText(nextSchedule.nextRunAt!, t)
          }}</span>
        </span>
        <span v-else :class="[BIG, 'text-muted-foreground font-medium']">{{
          t('tasks.overview.strip.notScheduled')
        }}</span>
        <span :class="SUB">
          <template v-if="draft">{{
            t('tasks.overview.strip.draft')
          }}</template>
          <template v-else-if="schedules?.length">
            {{
              t(
                'tasks.overview.strip.schedules',
                { n: schedules.length, on: schedulesOn },
                schedules.length
              )
            }}
          </template>
          <template v-else>{{
            t('tasks.overview.strip.addSchedule')
          }}</template>
        </span>
      </button>

      <!-- Alerts: opens the full list; nothing to open when there are none. -->
      <button
        v-if="alerts.length"
        type="button"
        :class="[
          TILE_BUTTON,
          openAlerts.length
            ? 'border-orange-400/60 dark:border-orange-500/50'
            : '',
        ]"
        data-testid="strip-alerts"
        @click="alertsOpen = true"
      >
        <span :class="LABEL">{{ t('alerts.overviewTitle') }}</span>
        <span :class="BIG">
          <BellRing
            v-if="openAlerts.length"
            class="size-4 shrink-0 text-orange-500"
          />
          <span class="truncate">
            {{
              openAlerts.length
                ? t('tasks.overview.strip.alertsOpen', { n: openAlerts.length })
                : t('tasks.overview.strip.noAlerts')
            }}
          </span>
        </span>
        <span :class="SUB">
          {{
            openAlerts.length
              ? openAlerts[0].title
              : t('tasks.overview.strip.acknowledged', { n: acknowledged })
          }}
        </span>
      </button>
      <div v-else :class="TILE" data-testid="strip-alerts">
        <span :class="LABEL">{{ t('alerts.overviewTitle') }}</span>
        <span :class="[BIG, 'text-muted-foreground font-medium']">{{
          t('tasks.overview.strip.noAlerts')
        }}</span>
        <span :class="SUB">{{ t('tasks.overview.strip.allClear') }}</span>
      </div>
    </div>

    <Dialog
      v-model="schedulesOpen"
      :title="t('schedules.card.title')"
      :description="taskName"
      content-class="sm:max-w-[560px]"
    >
      <TaskSchedulesCard
        v-if="schedulesOpen"
        bare
        :task-identifier="taskIdentifier"
        :task-name="taskName"
        :draft="draft"
        @changed="loadSchedules"
      />
    </Dialog>

    <Dialog
      v-model="alertsOpen"
      :title="t('alerts.overviewTitle')"
      :description="taskName"
      content-class="sm:max-w-[560px]"
    >
      <TaskAlertsCard
        v-if="alertsOpen"
        bare
        :task-identifier="taskIdentifier"
      />
    </Dialog>
  </div>
</template>

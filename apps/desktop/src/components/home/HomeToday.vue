<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { addDays, format, formatDistanceToNow, startOfDay } from 'date-fns';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { useInbox } from '@/composables/useInbox';
import { useQuery } from '@/composables/useQuery';
import { useStreamListener } from '@/composables/useStreamListener';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// Home's Today row: one look says whether today went well, what needs the user, and what
// runs next. Each card opens the page with the details.
const props = defineProps<{ tasks: TaskItem[] | null | undefined }>();

type Period = { from: string; to: string; total: number; failed: number };

const DAYS = 7;
const REFRESH_MS = 60_000;

const { t } = useI18n();
const router = useRouter();
const { approvals } = useInbox(toRef(props, 'tasks'));
const { data: schedules, refetch: refetchSchedules } = useQuery<ScheduleItem[]>(SEND.SCHEDULE_LIST, {});
const { events } = useStreamListener();

const now = ref(new Date());
const days = ref<Period[] | null>(null);

// Day boundaries in the user's own time zone (DST-safe), oldest first; Core only counts.
async function loadStats() {
  now.value = new Date();
  const today = startOfDay(now.value);
  const boundaries = Array.from({ length: DAYS + 1 }, (_, i) => addDays(today, i - DAYS + 1).toISOString());
  try {
    days.value = (await invokeCore<Period[]>(SEND.PIPELINE_STATS, { boundaries })) ?? null;
  } catch {
    // An older Core without the stats command: the tiles show a dash.
    days.value = null;
  }
}

const today = computed(() => days.value?.[days.value.length - 1] ?? null);
const maxRuns = computed(() => Math.max(1, ...(days.value ?? []).map((d) => d.total)));
const bars = computed(() =>
  (days.value ?? []).map((d, i, all) => {
    // Labelled from the days asked for, not Core's echo of them.
    const label = i === all.length - 1 ? t('dashboard.today.todayLabel') : format(addDays(startOfDay(now.value), i - all.length + 1), 'EEE');
    return {
      key: d.from,
      isToday: i === all.length - 1,
      height: `${Math.max(6, Math.round((d.total / maxRuns.value) * 100))}%`,
      title: t('dashboard.today.dayRuns', { day: label, n: d.total }, d.total),
    };
  })
);
const chartLabel = computed(() =>
  t('dashboard.today.chartLabel', { list: (days.value ?? []).map((d) => d.total).join(', ') })
);

// Names for "Failed today": workflows whose latest run failed since midnight.
const failedToday = computed(() => {
  const since = startOfDay(now.value).getTime();
  return (props.tasks ?? [])
    .filter((task) => task.last_run_status === 'failed' && task.last_run_at && new Date(task.last_run_at).getTime() >= since)
    .sort((a, b) => new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime());
});
const failedNames = computed(() => {
  const [first, ...rest] = failedToday.value;
  if (!first) return '';
  return rest.length ? t('dashboard.today.failedMore', { name: first.name, count: rest.length }) : first.name;
});

const nextRun = computed(() => {
  const upcoming = (schedules.value ?? [])
    .filter((s) => s.enabled && s.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!));
  return upcoming[0] ?? null;
});
const nextRunIn = computed(() => {
  void now.value; // re-read every minute
  return nextRun.value ? formatDistanceToNow(new Date(nextRun.value.nextRunAt!), { addSuffix: true }) : '';
});

// Counts change when runs start and end; the clock text changes every minute.
let pending: ReturnType<typeof setTimeout> | null = null;
watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !['start', 'end', 'error'].includes(latest.type)) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void loadStats(), 500);
  }
);

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void loadStats();
  timer = setInterval(() => {
    void loadStats();
    refetchSchedules();
  }, REFRESH_MS);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (pending) clearTimeout(pending);
});

// White chips on Home's banner, one per number: a label, the number, and a line about it.
const cell =
  'flex flex-col gap-1 min-w-0 px-3.5 py-2.5 rounded-lg bg-card shadow-xs ring-1 ring-black/5 dark:ring-white/10 text-left hover:ring-black/15 dark:hover:ring-white/25 transition-shadow';
const label = 'text-xs font-medium text-muted-foreground truncate';
const value = 'text-2xl font-semibold leading-none tabular-nums';
const detail = 'text-xs truncate min-w-0';
const row = 'flex items-baseline gap-2 min-w-0';

// "25m", "3h", "2d": short enough for the square.
const nextRunShort = computed(() => {
  void now.value;
  if (!nextRun.value) return '—';
  const minutes = Math.max(0, Math.round((Date.parse(nextRun.value.nextRunAt!) - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
});
</script>

<template>
  <section class="grid gap-3 grid-cols-2 md:grid-cols-4" :aria-label="t('dashboard.today.title')">
    <button type="button" :class="cell" @click="router.push('/activity')">
      <span :class="label">{{ t('dashboard.today.runs') }}</span>
      <span class="flex items-end gap-3 min-w-0">
        <span :class="value">{{ today ? today.total : '—' }}</span>
        <span v-if="bars.length" class="flex items-end gap-0.5 h-6 w-14 shrink-0" role="img" :aria-label="chartLabel">
          <span
            v-for="bar in bars"
            :key="bar.key"
            class="flex-1 rounded-t-sm"
            :class="bar.isToday ? 'bg-blue-500' : 'bg-blue-500/30'"
            :style="{ height: bar.height }"
            :title="bar.title"
          />
        </span>
        <span :class="[detail, 'text-muted-foreground']">{{ t('dashboard.today.lastDays', { n: DAYS }) }}</span>
      </span>
    </button>

    <button
      type="button"
      :class="cell"
      @click="router.push({ path: '/activity', query: { status: 'failed' } })"
    >
      <span :class="label">{{ t('dashboard.today.failed') }}</span>
      <span :class="row">
        <span :class="[value, today && today.failed > 0 ? 'text-destructive' : '']">{{ today ? today.failed : '—' }}</span>
        <span :class="[detail, today && today.failed > 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400']">
          {{ today && today.failed > 0 ? failedNames || t('dashboard.today.failedSome') : t('dashboard.today.failedNone') }}
        </span>
      </span>
    </button>

    <button
      type="button"
      :class="cell"
      @click="router.push('/approvals')"
    >
      <span :class="label">{{ t('dashboard.today.waiting') }}</span>
      <span :class="row">
        <span :class="[value, approvals.length ? 'text-amber-600 dark:text-amber-400' : '']">{{ approvals.length }}</span>
        <span :class="[detail, approvals.length ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground']">
          {{ approvals.length ? t('dashboard.today.approvals', approvals.length) : t('dashboard.today.approvalsNone') }}
        </span>
      </span>
    </button>

    <button type="button" :class="cell" @click="router.push('/schedules')">
      <span :class="label">{{ t('dashboard.today.next') }}</span>
      <span :class="row">
        <span :class="value" :title="nextRun ? nextRunIn : undefined">{{ nextRunShort }}</span>
        <span :class="[detail, 'text-muted-foreground']">{{ nextRun ? nextRun.taskName : t('dashboard.today.nextNone') }}</span>
      </span>
    </button>
  </section>
</template>

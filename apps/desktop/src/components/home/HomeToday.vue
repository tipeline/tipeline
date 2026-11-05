<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { addDays, format, formatDistanceToNow, startOfDay } from 'date-fns';
import { AlertCircle, CalendarClock, CheckCircle2, ShieldCheck } from 'lucide-vue-next';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { useInbox } from '@/composables/useInbox';
import { useQuery } from '@/composables/useQuery';
import { useStreamListener } from '@/composables/useStreamListener';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// The full dashboard's top row: one look says whether today went well, what needs the
// user, and what runs next. Each tile opens the page with the details.
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

const tile =
  'flex flex-col gap-1.5 min-w-0 px-4 py-3.5 border border-border rounded-md bg-card hover:bg-muted/50 transition-colors text-left';
</script>

<template>
  <section class="grid gap-3 grid-cols-4" :aria-label="t('dashboard.today.title')">
    <button type="button" :class="tile" @click="router.push('/activity')">
      <span class="text-xs font-medium text-muted-foreground">{{ t('dashboard.today.runs') }}</span>
      <span class="flex items-end justify-between gap-3">
        <span class="text-2xl font-semibold leading-none tabular-nums shrink-0">{{ today ? today.total : '—' }}</span>
        <span v-if="bars.length" class="flex items-end gap-0.5 h-8 flex-1 min-w-0 max-w-28" role="img" :aria-label="chartLabel">
          <span
            v-for="bar in bars"
            :key="bar.key"
            class="flex-1 rounded-t-sm"
            :class="bar.isToday ? 'bg-blue-500' : 'bg-blue-500/30'"
            :style="{ height: bar.height }"
            :title="bar.title"
          />
        </span>
      </span>
      <span class="text-xs text-muted-foreground">{{ t('dashboard.today.lastDays', { n: DAYS }) }}</span>
    </button>

    <button
      type="button"
      :class="tile"
      @click="router.push({ path: '/activity', query: { status: 'failed' } })"
    >
      <span class="text-xs font-medium text-muted-foreground">{{ t('dashboard.today.failed') }}</span>
      <span v-if="today && today.failed > 0" class="flex items-center gap-2 text-destructive">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span class="text-2xl font-semibold leading-none tabular-nums">{{ today.failed }}</span>
      </span>
      <span v-else class="flex items-center gap-2">
        <CheckCircle2 v-if="today" class="w-4 h-4 shrink-0 text-emerald-500" />
        <span class="text-2xl font-semibold leading-none tabular-nums">{{ today ? 0 : '—' }}</span>
      </span>
      <span class="text-xs text-muted-foreground truncate">
        {{ today && today.failed > 0 ? failedNames || t('dashboard.today.failedSome') : t('dashboard.today.failedNone') }}
      </span>
    </button>

    <button type="button" :class="tile" @click="router.push('/approvals')">
      <span class="text-xs font-medium text-muted-foreground">{{ t('dashboard.today.waiting') }}</span>
      <span class="flex items-center gap-2">
        <ShieldCheck class="w-4 h-4 shrink-0" :class="approvals.length ? 'text-amber-500' : 'text-muted-foreground'" />
        <span class="text-2xl font-semibold leading-none tabular-nums">{{ approvals.length }}</span>
      </span>
      <span class="text-xs text-muted-foreground truncate">
        {{ approvals.length ? t('dashboard.today.approvals', approvals.length) : t('dashboard.today.approvalsNone') }}
      </span>
    </button>

    <button type="button" :class="tile" @click="router.push('/schedules')">
      <span class="text-xs font-medium text-muted-foreground">{{ t('dashboard.today.next') }}</span>
      <span class="flex items-center gap-2 min-w-0">
        <CalendarClock class="w-4 h-4 shrink-0 text-muted-foreground" />
        <span class="text-lg font-semibold leading-tight truncate">{{ nextRun ? nextRunIn : '—' }}</span>
      </span>
      <span class="text-xs text-muted-foreground truncate">
        {{ nextRun ? nextRun.taskName : t('dashboard.today.nextNone') }}
      </span>
    </button>
  </section>
</template>

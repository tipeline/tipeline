<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { addDays, format, isToday, isTomorrow, startOfDay } from 'date-fns';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { useStreamListener } from '@/composables/useStreamListener';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { HOME_LINK } from '@/config/homeStyles';

// The line under Home's greeting: today's runs and failures, and what runs next. Small on
// purpose — what needs a reaction is already in "Needs you"; the rest is on Runs.
const props = defineProps<{ schedules: ScheduleItem[] | null | undefined }>();

type Period = { total: number; failed: number };
const REFRESH_MS = 60_000;

const { t } = useI18n();
const router = useRouter();
const { events } = useStreamListener();
const today = ref<Period | null>(null);

async function load() {
  const start = startOfDay(new Date());
  try {
    const [period] =
      (await invokeCore<Period[]>(SEND.PIPELINE_STATS, {
        boundaries: [start.toISOString(), addDays(start, 1).toISOString()],
      })) ?? [];
    today.value = period ?? null;
  } catch {
    // An older Core without the stats command: the counts show a dash.
    today.value = null;
  }
}

const nextRun = computed(() =>
  (props.schedules ?? [])
    .filter((s) => s.enabled && s.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0] ?? null
);
// "at 15:00", "tomorrow at 02:00", "on Fri 14 Nov at 09:00".
const nextWhen = computed(() => {
  if (!nextRun.value) return '';
  const date = new Date(nextRun.value.nextRunAt!);
  const time = format(date, 'HH:mm');
  if (isToday(date)) return t('dashboard.day.at', { time });
  if (isTomorrow(date)) return t('dashboard.day.tomorrowAt', { time });
  return t('dashboard.day.onDayAt', { day: format(date, 'EEE d MMM'), time });
});

let pending: ReturnType<typeof setTimeout> | null = null;
watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !['start', 'end', 'error'].includes(latest.type)) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => void load(), 500);
  }
);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), REFRESH_MS);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (pending) clearTimeout(pending);
});
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
    <span>
      <strong class="text-foreground tabular-nums">{{ today ? today.total : '—' }}</strong>
      {{ t('dashboard.day.runs', today?.total ?? 0) }}
    </span>
    <span v-if="today" aria-hidden="true">·</span>
    <button
      v-if="today && today.failed > 0"
      type="button"
      class="hover:underline"
      @click="router.push({ path: '/activity', query: { status: 'failed' } })"
    >
      <strong class="text-red-700 dark:text-red-400 tabular-nums">{{ today.failed }}</strong>
      {{ t('dashboard.day.failed') }}
    </button>
    <span v-else-if="today">{{ t('dashboard.day.noneFailed') }}</span>
    <span aria-hidden="true">·</span>
    <!-- "Next:" is a label; the link is the run itself, which opens Schedules. -->
    <span v-if="nextRun">
      {{ t('dashboard.day.next') }}
      <button type="button" class="hover:underline text-left" @click="router.push('/schedules')">
        <strong class="text-foreground">{{ nextRun.taskName }}</strong>
        {{ nextWhen }}
      </button>
    </span>
    <span v-else>{{ t('dashboard.day.nothingScheduled') }}</span>
    <span aria-hidden="true">·</span>
    <button type="button" :class="HOME_LINK" @click="router.push('/activity')">
      {{ t('dashboard.day.allRuns') }}
    </button>
  </div>
</template>

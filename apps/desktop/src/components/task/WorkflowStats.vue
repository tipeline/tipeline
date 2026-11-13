<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { addDays, startOfDay } from 'date-fns';
import { useStreamListener } from '@/composables/useStreamListener';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// The four numbers above the Workflows list: how all workflows did over the last seven
// days. Failed opens the failed runs.
type Period = { total: number; failed: number; finished?: number; durationMs?: number };

const DAYS = 7;
const REFRESH_MS = 60_000;

const { t } = useI18n();
const router = useRouter();
const { events } = useStreamListener();
const periods = ref<Period[] | null>(null);

async function load() {
  const today = startOfDay(new Date());
  // One period for the whole week, from local midnight six days ago until tomorrow.
  const boundaries = [addDays(today, 1 - DAYS).toISOString(), addDays(today, 1).toISOString()];
  try {
    periods.value = (await invokeCore<Period[]>(SEND.PIPELINE_STATS, { boundaries })) ?? null;
  } catch {
    periods.value = null;
  }
}

const week = computed(() => periods.value?.[0] ?? null);
const failureRate = computed(() => {
  if (!week.value || !week.value.total) return '—';
  const rate = (week.value.failed / week.value.total) * 100;
  return `${rate < 10 ? rate.toFixed(1) : Math.round(rate)}%`;
});
const averageTime = computed(() => {
  const finished = week.value?.finished ?? 0;
  // Older cores don't report run times.
  if (!week.value || !finished || week.value.durationMs === undefined) return '—';
  const ms = week.value.durationMs / finished;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`;
});

let pending: ReturnType<typeof setTimeout> | null = null;
watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !['end', 'error'].includes(latest.type)) return;
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

const cell = 'flex flex-col gap-1 min-w-0 px-4 py-3 text-left';
const label = 'text-xs font-medium text-muted-foreground truncate';
const value = 'text-xl font-semibold leading-none tabular-nums';
</script>

<template>
  <section
    class="grid grid-cols-2 md:grid-cols-4 rounded-lg border border-border bg-card divide-x divide-border shrink-0 mb-4"
    :aria-label="t('tasks.stats.title', { n: DAYS })"
  >
    <button type="button" :class="[cell, 'hover:bg-muted/50 transition-colors']" @click="router.push('/activity')">
      <span :class="label">{{ t('tasks.stats.runs', { n: DAYS }) }}</span>
      <span :class="value">{{ week ? week.total : '—' }}</span>
    </button>
    <button
      type="button"
      :class="[cell, 'hover:bg-muted/50 transition-colors']"
      @click="router.push({ path: '/activity', query: { status: 'failed' } })"
    >
      <span :class="label">{{ t('tasks.stats.failed', { n: DAYS }) }}</span>
      <span :class="[value, week && week.failed ? 'text-red-700 dark:text-red-400' : '']">{{ week ? week.failed : '—' }}</span>
    </button>
    <div :class="cell">
      <span :class="label">{{ t('tasks.stats.failureRate') }}</span>
      <span :class="value">{{ failureRate }}</span>
    </div>
    <div :class="cell">
      <span :class="label">{{ t('tasks.stats.averageTime') }}</span>
      <span :class="value">{{ averageTime }}</span>
    </div>
  </section>
</template>

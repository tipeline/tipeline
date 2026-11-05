<script setup lang="ts">
// One line about the run above its steps: status (and where it failed), when it started,
// how long it took, what started it, and how many steps ended which way.
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { AppWindow } from 'lucide-vue-next';
import { countSteps, firstFailed, formatStepDuration, stepLabel } from '@/utils/runSteps';

const props = defineProps<{
  pipeline: any;
  actions: any[];
  window: { start: number; end: number } | null;
  now: number | null;
}>();

const { t } = useI18n();
const router = useRouter();

const STATUS_CLASSES: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-500',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-red-500/10 text-red-500',
  pending: 'bg-gray-400/10 text-gray-500',
  paused: 'bg-amber-500/10 text-amber-600',
  canceled: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

const status = computed<string>(() => props.pipeline?.status ?? 'pending');
const awaiting = computed(() => status.value === 'paused' && !!props.pipeline?.metadata?.approval);
const statusLabel = computed(() => {
  const key = awaiting.value ? 'taskHistory.awaitingApproval' : `taskHistory.${status.value}`;
  return t(key) !== key ? t(key) : status.value;
});
const failedAt = computed(() => {
  if (status.value !== 'failed') return null;
  const row = firstFailed(props.actions);
  return row ? stepLabel(row.action) : null;
});
const counts = computed(() => countSteps(props.actions, props.now));
const startedAt = computed(() =>
  props.pipeline?.started_at
    ? new Date(props.pipeline.started_at).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null
);
const trigger = computed(() => {
  const tr = props.pipeline?.metadata?.trigger;
  return tr?.type === 'app' ? tr : null;
});
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground" data-testid="run-summary">
    <span class="inline-flex h-[22px] items-center rounded-full px-2 text-xs font-semibold" :class="STATUS_CLASSES[status] ?? STATUS_CLASSES.pending">
      {{ failedAt ? t('runDetail.failedAt', { step: failedAt }) : statusLabel }}
    </span>
    <span v-if="startedAt">{{ t('runDetail.started') }} <b class="font-medium text-foreground tabular-nums">{{ startedAt }}</b></span>
    <span v-if="window">{{ t('runDetail.duration') }} <b class="font-medium text-foreground tabular-nums">{{ formatStepDuration(window.end - window.start) }}</b></span>
    <button
      v-if="trigger"
      class="inline-flex items-center gap-1 hover:text-foreground hover:underline underline-offset-2"
      @click="router.push(`/apps/${trigger.appIdentifier}`)"
    >
      {{ t('taskHistory.startedBy') }}
      <AppWindow class="size-3.5" />
      <b class="font-medium text-foreground">{{ trigger.appName }}</b>
    </button>
    <span class="ml-auto flex flex-wrap gap-3">
      <span v-if="counts.completed" class="inline-flex items-center gap-1.5"><i class="inline-block size-2 rounded-[2px] bg-emerald-500" />{{ t('runDetail.counts.completed', { count: counts.completed }, counts.completed) }}</span>
      <span v-if="counts.cached" class="inline-flex items-center gap-1.5"><i class="inline-block size-2 rounded-[2px] bg-violet-500" />{{ t('runDetail.counts.cached', { count: counts.cached }, counts.cached) }}</span>
      <span v-if="counts.failed" class="inline-flex items-center gap-1.5"><i class="inline-block size-2 rounded-[2px] bg-destructive" />{{ t('runDetail.counts.failed', { count: counts.failed }, counts.failed) }}</span>
      <span v-if="counts.running" class="inline-flex items-center gap-1.5"><i class="inline-block size-2 rounded-[2px] bg-primary" />{{ t('runDetail.counts.running', { count: counts.running }, counts.running) }}</span>
      <span v-if="counts.pending" class="inline-flex items-center gap-1.5"><i class="inline-block size-2 rounded-[2px] border-[1.5px] border-dashed border-muted-foreground/50" />{{ now === null ? t('runDetail.counts.notRun', { count: counts.pending }, counts.pending) : t('runDetail.counts.waiting', { count: counts.pending }, counts.pending) }}</span>
    </span>
  </div>
</template>

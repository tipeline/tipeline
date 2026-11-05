<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Ban,
  CircleCheck,
  CircleX,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-vue-next';
import type { RunStatus } from '@/composables/useAppRuntime';
import { formatDuration } from '@/utils/formatDuration';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import CancelRunButton from '@/components/CancelRunButton.vue';

// One line about the workflow run a widget started: while it runs, how many steps
// have finished, the last one and the elapsed time; once it ends, how it went. A
// success fades after a while; a failure, a pause or a cancel stays until the next run.
const props = defineProps<{ run: RunStatus | null | undefined }>();
const { t } = useI18n();

const SUCCESS_VISIBLE_MS = 10_000;

const now = ref(Date.now());
const hidden = ref(false);
let ticker: ReturnType<typeof setInterval> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function stopTimers() {
  clearInterval(ticker);
  clearTimeout(hideTimer);
  ticker = hideTimer = undefined;
}

watch(
  () => [props.run?.status, props.run?.startedAt, props.run?.finishedAt],
  () => {
    stopTimers();
    hidden.value = false;
    now.value = Date.now();
    if (props.run?.status === 'running')
      ticker = setInterval(() => (now.value = Date.now()), 1000);
    else if (props.run?.status === 'finished')
      hideTimer = setTimeout(() => (hidden.value = true), SUCCESS_VISIBLE_MS);
  },
  { immediate: true }
);
onBeforeUnmount(stopTimers);

const visible = computed(
  () => !!props.run && props.run.status !== 'idle' && !hidden.value
);
const elapsed = computed(() => {
  const run = props.run;
  if (!run?.startedAt) return '';
  return formatDuration((run.finishedAt ?? now.value) - run.startedAt);
});
const steps = computed(() =>
  t('apps.runStatus.steps', { n: props.run?.steps ?? 0 }, props.run?.steps ?? 0)
);
const canOpenRun = computed(
  () =>
    !!props.run?.workflowIdentifier &&
    !!props.run.pipelineIdentifier &&
    props.run.status !== 'running'
);

function openRun() {
  const run = props.run;
  if (!run) return;
  openInWindow(
    windowPaths.run(run.workflowIdentifier, run.pipelineIdentifier),
    t('runWindow.title', { id: run.pipelineIdentifier })
  );
}
</script>

<template>
  <div
    v-if="visible && run"
    class="flex items-center gap-1.5 min-w-0 text-xs"
    role="status"
    aria-live="polite"
  >
    <template v-if="run.status === 'running'">
      <Loader2 class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      <span class="shrink-0">{{ t('apps.runStatus.running') }}</span>
      <span class="shrink-0 text-muted-foreground">· {{ steps }}</span>
      <span
        v-if="run.lastStep"
        class="truncate text-muted-foreground font-mono"
        :title="run.lastStep"
        >· {{ run.lastStep }}</span
      >
      <span class="shrink-0 ml-auto tabular-nums text-muted-foreground">{{
        elapsed
      }}</span>
      <CancelRunButton
        v-if="run.correlationId"
        :target="{ correlationId: run.correlationId }"
        variant="link"
      />
    </template>

    <template v-else-if="run.status === 'finished'">
      <CircleCheck
        class="size-3.5 shrink-0 text-green-600 dark:text-green-400"
      />
      <span v-if="run.cachedAt" class="truncate">{{
        t('apps.runStatus.fromCache', { age: formatDuration(now - run.cachedAt) })
      }}</span>
      <span v-else class="truncate">{{
        t('apps.runStatus.finished', { duration: elapsed, steps })
      }}</span>
    </template>

    <template v-else-if="run.status === 'paused'">
      <ShieldCheck
        class="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <span class="truncate">{{ t('apps.runStatus.paused') }}</span>
      <CancelRunButton
        v-if="run.pipelineIdentifier"
        :target="{ pipelineIdentifier: run.pipelineIdentifier }"
        variant="link"
        waiting
      />
    </template>

    <template v-else-if="run.status === 'canceled'">
      <Ban class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="truncate">{{
        run.steps
          ? t('apps.runStatus.canceled', { steps })
          : t('apps.runStatus.canceledEarly')
      }}</span>
    </template>

    <template v-else-if="run.status === 'failed'">
      <CircleX class="size-3.5 shrink-0 text-destructive" />
      <span
        class="truncate text-destructive"
        :title="run.error ?? undefined"
        >{{
          run.failedStep
            ? t('apps.runStatus.failedAt', { step: run.failedStep })
            : t('apps.runStatus.failed')
        }}<template v-if="run.error">: {{ run.error }}</template></span
      >
    </template>

    <button
      v-if="canOpenRun"
      type="button"
      class="shrink-0 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      @click="openRun"
    >
      {{ t('apps.runStatus.viewRun') }}
      <ExternalLink class="size-3" />
    </button>
  </div>
</template>

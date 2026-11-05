<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Pause, Play, RefreshCw, Timer } from 'lucide-vue-next';
import { APP_PAGE_GRID } from '../appCanvasKey';
import { isShown } from './visibility';

// Fires `tick` every `interval` seconds — e.g. to refresh a dashboard. The ticking is
// the runtime's (it goes on while this widget is hidden); this only shows the
// countdown, with pause / resume and "run now" buttons.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t } = useI18n();
const pageGrid = inject(APP_PAGE_GRID, null);
const visible = computed(() => isShown(props.props.visible, props.editable));

const seconds = computed(() => {
  const n = Number(props.props.interval ?? 30);
  return Number.isFinite(n) && n >= 1 ? n : 30;
});
const running = computed(() => (props.editable ? true : !!props.state?.running));

// A second hand for the countdown.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 250)));
onBeforeUnmount(() => clearInterval(clock));

const left = computed(() => {
  if (props.editable) return seconds.value;
  const at = Number(props.state?.nextAt);
  return at ? Math.max(0, Math.ceil((at - now.value) / 1000)) : null;
});

/** "12 s", "1:05", "1:00:00". */
function clockText(total: number): string {
  if (total < 60) return t('apps.timer.seconds', { count: total });
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const status = computed(() => {
  if (props.busy) return t('apps.timer.working');
  if (!running.value || left.value === null)
    return props.props.repeat === false && Number(props.state?.ticks) > 0 ? t('apps.timer.done') : t('apps.timer.paused');
  return t('apps.timer.in', { time: clockText(left.value) });
});

// How far through the current interval we are (a thin bar under the row).
const progress = computed(() =>
  running.value && left.value !== null ? 1 - left.value / seconds.value : 0
);

function toggle() {
  if (!props.editable) pageGrid?.runtime.setTimerRunning(props.componentId, !running.value);
}
function runNow() {
  if (!props.editable) pageGrid?.runtime.fireTimer(props.componentId);
}
const button =
  'shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50';
</script>

<template>
  <div v-if="visible" class="h-full flex flex-col justify-center gap-1 p-(--app-pad-tight) min-w-0">
    <div class="flex items-center gap-2 min-w-0 text-sm">
      <Timer class="size-4 shrink-0 text-muted-foreground" :class="busy && 'animate-pulse'" />
      <span v-if="props.props.label" class="font-medium truncate">{{ props.props.label }}</span>
      <span class="text-muted-foreground tabular-nums truncate" data-testid="timer-status">{{ status }}</span>
      <template v-if="!props.props.hideControls">
        <button
          type="button"
          :class="[button, 'ml-auto']"
          :title="running ? t('apps.timer.pause') : t('apps.timer.resume')"
          :aria-label="running ? t('apps.timer.pause') : t('apps.timer.resume')"
          @click="toggle"
        >
          <component :is="running ? Pause : Play" class="size-3.5" />
        </button>
        <button
          type="button"
          :class="button"
          :disabled="busy"
          :title="t('apps.timer.runNow')"
          :aria-label="t('apps.timer.runNow')"
          @click="runNow"
        >
          <RefreshCw class="size-3.5" :class="busy && 'animate-spin'" />
        </button>
      </template>
    </div>
    <div class="h-0.5 rounded bg-muted overflow-hidden">
      <div
        class="h-full bg-primary/60 transition-[width] duration-300 ease-linear"
        :style="{ width: `${Math.round(progress * 100)}%` }"
      />
    </div>
  </div>
  <!-- Hidden: tells the grid cell to drop its card chrome (see AppGrid). -->
  <div v-else class="app-widget-hidden" />
</template>

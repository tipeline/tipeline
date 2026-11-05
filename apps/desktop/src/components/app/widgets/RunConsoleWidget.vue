<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader2,
  Play,
  ShieldCheck,
  Terminal,
} from 'lucide-vue-next';
import { APP_RUNTIME } from '../appRuntimeKey';
import CancelRunButton from '@/components/CancelRunButton.vue';
import type { RunLogEntry } from '@/composables/useAppRuntime';

// Live log of a runnable's latest run: each workflow step as it finishes, errors,
// and how the run ended. Follows the newest line unless the user scrolled up.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t } = useI18n();
const runtime = inject(APP_RUNTIME, null);

const SAMPLE: RunLogEntry[] = [
  { at: 0, kind: 'started', name: 'save' },
  { at: 0, kind: 'action', name: 'file.read', detail: '"…"' },
  { at: 0, kind: 'action', name: 'script.runScript', detail: '{"id":7}' },
  { at: 0, kind: 'finished', name: 'save' },
];

const run = computed(() => runtime?.runnables[props.props.runnable]);
const entries = computed<RunLogEntry[]>(() =>
  props.editable || !runtime ? SAMPLE : (run.value?.log ?? [])
);

const ICONS = {
  started: Play,
  action: CircleCheck,
  error: CircleAlert,
  finished: CircleCheck,
  failed: CircleX,
  paused: ShieldCheck,
  canceled: Ban,
} as const;
const TONE: Record<RunLogEntry['kind'], string> = {
  started: 'text-muted-foreground',
  action: 'text-foreground',
  error: 'text-destructive',
  finished: 'text-green-600 dark:text-green-400',
  failed: 'text-destructive',
  paused: 'text-amber-600 dark:text-amber-400',
  canceled: 'text-muted-foreground',
};
const time = (at: number) => (at ? new Date(at).toLocaleTimeString() : '');
function label(e: RunLogEntry): string {
  if (e.kind === 'started') return t('apps.console.started', { name: e.name });
  if (e.kind === 'finished')
    return t('apps.console.finished', { name: e.name });
  if (e.kind === 'failed') return t('apps.console.failed', { name: e.name });
  if (e.kind === 'paused') return t('apps.console.paused', { name: e.name });
  if (e.kind === 'canceled')
    return t('apps.console.canceled', { name: e.name });
  return e.name;
}

const scroller = ref<HTMLElement | null>(null);
watch(
  () => entries.value.length,
  async () => {
    const el = scroller.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    await nextTick();
    if (atBottom) el.scrollTop = el.scrollHeight;
  }
);
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="flex items-center gap-2 border-b px-(--app-pad) py-2 text-xs shrink-0">
      <Terminal class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate">{{
        props.props.title ||
        t('apps.console.title', { name: props.props.runnable })
      }}</span>
      <template v-if="run?.isRunning && !editable">
        <Loader2 class="size-3.5 animate-spin text-muted-foreground ml-auto" />
        <CancelRunButton
          v-if="run.correlationId"
          :target="{ correlationId: run.correlationId }"
          variant="link"
        />
      </template>
    </div>
    <div
      ref="scroller"
      class="flex-1 min-h-0 overflow-auto font-mono text-[11px] leading-5 px-(--app-pad) py-2"
      role="log"
      aria-live="polite"
    >
      <p
        v-if="!entries.length"
        class="text-muted-foreground m-0 font-sans text-xs"
      >
        {{ t('apps.console.empty') }}
      </p>
      <div
        v-for="(e, i) in entries"
        :key="i"
        class="flex gap-2"
        :class="TONE[e.kind]"
      >
        <span class="text-muted-foreground shrink-0 tabular-nums">{{
          time(e.at)
        }}</span>
        <component :is="ICONS[e.kind]" class="size-3 mt-1 shrink-0" />
        <span class="shrink-0">{{ label(e) }}</span>
        <span
          v-if="e.detail"
          class="text-muted-foreground truncate"
          :title="e.detail"
          >{{ e.detail }}</span
        >
      </div>
    </div>
  </div>
</template>

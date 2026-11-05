<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExternalLink, History, RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import CancelRunButton from '@/components/CancelRunButton.vue';
import AppBadge from '../AppBadge.vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { formatDuration } from '@/utils/formatDuration';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import { APP_RUNTIME } from '../appRuntimeKey';
import AppSkeleton from './AppSkeleton.vue';

// Past and live runs of the app's workflows (all, or the aliases in `workflows`),
// newest first: status, workflow, what started it, when, how long — live while it
// runs — and why it failed or was canceled. Running and waiting runs can be canceled;
// any run opens in its own window. Clicking a row fires `rowClick` (`selectedRun`).
// Core only lists runs of workflows the app declares, and only runs that keep
// history (not `persist: false` runnables).
export interface AppRun {
  pipelineIdentifier: string;
  taskIdentifier: string;
  workflow: string | null;
  workflowName: string;
  status: 'pending' | 'running' | 'failed' | 'completed' | 'canceled' | 'paused';
  startedAt: string | null;
  finishedAt: string | null;
  trigger: { type: string | null; name: string | null };
  message: string | null;
}

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();
const { t, locale } = useI18n();
const runtime = inject(APP_RUNTIME, null);

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const SAMPLE: AppRun[] = [
  { pipelineIdentifier: 's1', taskIdentifier: '', workflow: null, workflowName: 'Sync invoices', status: 'running', startedAt: ago(1), finishedAt: null, trigger: { type: 'schedule', name: null }, message: null },
  { pipelineIdentifier: 's2', taskIdentifier: '', workflow: null, workflowName: 'Sync invoices', status: 'completed', startedAt: ago(62), finishedAt: ago(61), trigger: { type: 'app', name: 'Billing' }, message: null },
  { pipelineIdentifier: 's3', taskIdentifier: '', workflow: null, workflowName: 'Send reminders', status: 'failed', startedAt: ago(180), finishedAt: ago(179), trigger: { type: 'app', name: 'Billing' }, message: 'SMTP server refused the connection' },
];

const STATUS_COLORS = {
  running: 'blue',
  pending: 'gray',
  paused: 'amber',
  completed: 'green',
  failed: 'red',
  canceled: 'gray',
};
const ACTIVE = new Set(['running', 'pending', 'paused']);

const live = computed(() => !props.editable && !!runtime);
const runs = ref<AppRun[]>([]);
const loading = ref(false);
const loadError = ref('');
const shown = computed(() => (live.value ? runs.value : SAMPLE));

const workflows = computed<string[] | undefined>(() =>
  Array.isArray(props.props.workflows) && props.props.workflows.length ? [...props.props.workflows] : undefined
);
const statuses = computed<string[] | undefined>(() =>
  Array.isArray(props.props.statuses) && props.props.statuses.length ? [...props.props.statuses] : undefined
);

async function refresh() {
  if (!live.value || loading.value) return;
  loading.value = true;
  try {
    runs.value = await invokeCore<AppRun[]>(SEND.APP_RUNS_LIST, {
      appIdentifier: runtime!.appIdentifier(),
      workflows: workflows.value,
      statuses: statuses.value,
      limit: Number(props.props.limit) || 20,
    });
    loadError.value = '';
  } catch (e: any) {
    loadError.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
  schedule();
}

// Quick refreshes while something runs (to see it finish), slow ones otherwise.
const FAST_MS = 3000;
const SLOW_MS = 30000;
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  if (!live.value) return;
  const busy = runs.value.some((r) => r.status === 'running' || r.status === 'pending');
  timer = setTimeout(() => void refresh(), busy ? FAST_MS : SLOW_MS);
}

// A run started from this page shows up — and its end too — without waiting: any
// runnable starting or stopping refreshes (not only "something runs" flipping).
const runningNow = computed(() =>
  Object.entries(runtime?.runnables ?? {})
    .filter(([, r]) => r.isRunning)
    .map(([name]) => name)
    .sort()
    .join(',')
);
watch(runningNow, () => void refresh());
watch([workflows, statuses, () => props.props.limit], () => void refresh());

// The clock for live durations.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void refresh();
  clock = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearInterval(clock);
});

function duration(run: AppRun): string {
  if (!run.startedAt) return '';
  const start = Date.parse(run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : run.status === 'running' ? now.value : NaN;
  return Number.isFinite(end) ? formatDuration(Math.max(0, end - start)) : '';
}

const relative = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' }));
function when(iso: string | null): string {
  if (!iso) return '';
  const seconds = Math.round((Date.parse(iso) - now.value) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return t('apps.runs.justNow');
  if (abs < 3600) return relative.value.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.value.format(Math.round(seconds / 3600), 'hour');
  return relative.value.format(Math.round(seconds / 86400), 'day');
}
const fullDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale.value) : '');

function triggerText(run: AppRun): string {
  const type = run.trigger.type;
  const label = type && ['app', 'schedule', 'user', 'webhook', 'manual', 'api', 'agent', 'subtask'].includes(type)
    ? t(`apps.runs.triggers.${type}`)
    : '';
  return [label, run.trigger.name].filter(Boolean).join(' · ');
}

function select(run: AppRun) {
  if (!live.value) return;
  emit('event', 'rowClick', { selectedRun: run });
}
function open(run: AppRun) {
  if (live.value && run.taskIdentifier) openInWindow(windowPaths.run(run.taskIdentifier, run.pipelineIdentifier), run.workflowName);
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="flex items-center gap-2 border-b px-(--app-pad) py-2 text-xs shrink-0">
      <History class="size-3.5 text-muted-foreground" />
      <span class="font-medium truncate">{{ props.props.title || t('apps.runs.title') }}</span>
      <span v-if="shown.some((r) => ACTIVE.has(r.status))" class="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1.5">
        {{ t('apps.runs.activeCount', { count: shown.filter((r) => ACTIVE.has(r.status)).length }) }}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="size-6 ml-auto"
        :aria-label="t('apps.runs.refresh')"
        :disabled="!live || loading"
        @click="refresh"
      >
        <RefreshCw class="size-3.5" :class="loading && 'animate-spin'" />
      </Button>
    </div>

    <p v-if="loadError" class="m-0 px-(--app-pad) py-2 text-xs text-destructive">{{ loadError }}</p>

    <AppSkeleton v-if="!shown.length && !loadError && loading" variant="list" class="flex-1" />
    <div
      v-else-if="!shown.length && !loadError"
      class="flex-1 flex items-center justify-center text-xs text-muted-foreground px-(--app-pad) text-center"
    >
      {{ props.props.emptyText || t('apps.runs.empty') }}
    </div>

    <ul v-else class="flex-1 min-h-0 overflow-auto m-0 p-0 list-none divide-y" :class="editable && 'opacity-70'">
      <li
        v-for="run in shown"
        :key="run.pipelineIdentifier"
        class="group/run flex items-start gap-3 px-(--app-pad) py-2 text-sm hover:bg-muted/40"
        :class="live && 'cursor-pointer'"
        :data-status="run.status"
        @click="select(run)"
      >
        <AppBadge :value="t(`apps.runs.status.${run.status}`)" :default-color="STATUS_COLORS[run.status]" class="mt-0.5 shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 min-w-0">
            <span class="font-medium truncate">{{ run.workflowName }}</span>
            <span v-if="triggerText(run)" class="text-xs text-muted-foreground truncate">{{ triggerText(run) }}</span>
          </div>
          <p
            v-if="run.message"
            class="m-0 text-xs truncate"
            :class="run.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'"
            :title="run.message"
          >
            {{ run.message }}
          </p>
        </div>
        <div class="shrink-0 text-right text-xs text-muted-foreground tabular-nums leading-5">
          <div :title="fullDate(run.startedAt)">{{ when(run.startedAt) }}</div>
          <div>{{ duration(run) }}</div>
        </div>
        <div class="shrink-0 flex items-center gap-0.5" @click.stop>
          <CancelRunButton
            v-if="live && !props.props.hideCancel && ACTIVE.has(run.status)"
            :target="{ pipelineIdentifier: run.pipelineIdentifier }"
            :waiting="run.status === 'paused'"
            variant="icon"
            @done="refresh"
          />
          <button
            v-if="!props.props.hideOpen"
            type="button"
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
            :title="t('apps.runs.open')"
            :aria-label="t('apps.runs.open')"
            :disabled="!live"
            @click="open(run)"
          >
            <ExternalLink class="size-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLocalStorage, useMediaQuery, useTimestamp } from '@vueuse/core';
import RunStepList from '@/components/run/RunStepList.vue';
import RunWaterfall from '@/components/run/RunWaterfall.vue';
import RunSummaryBar from '@/components/run/RunSummaryBar.vue';
import RunStepsSkeleton from '@/components/run/RunStepsSkeleton.vue';
import RunVariablesPanel, { type RunVariable } from '@/components/task/RunVariablesPanel.vue';
import Card from '@/components/Card.vue';
import CopyButton from '@/components/CopyButton.vue';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Braces, Download, ExternalLink, FileJson, FileText, ListTree } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import { useQuery } from '@/composables/useQuery';
import { usePipelineResult } from '@/composables/usePipelineResult';
import { useChildRuns } from '@/composables/useChildRuns';
import { useOpenRun } from '@/composables/useOpenRun';
import { useStreamListenerPipeline } from '@/composables/useStreamListenerPipeline';
import { applyLiveEvents } from '@/composables/useTimelineUpdater';
import { runWindow, stepChildren } from '@/utils/runSteps';
import { SEND } from '@/ipc-channels';
import { toast } from '@/components/ui/sonner';
import CancelRunButton from '@/components/CancelRunButton.vue';

const route = useRoute();
const router = useRouter();
const pipelineId = route.params.pipelineId as string;
const { t } = useI18n();
// Also shown on its own in a window (route RunWindow), where there's nowhere to go back to.
const inWindow = route.name === 'RunWindow';
function openRunWindow() {
  openInWindow(windowPaths.run(route.params.tid as string, pipelineId), t('runWindow.title', { id: pipelineId }));
}
const timelineActions = ref([]);

const { data: result, isLoading, refetch } = useQuery(SEND.PIPELINE_DETAIL, {
  pipelineIdentifier: pipelineId,
});
const { events, hasEnded } = useStreamListenerPipeline(pipelineId);
// The runs its sub-workflow steps started, listed under those steps.
useChildRuns(pipelineId, result, timelineActions);
const openRun = useOpenRun();
// A sub-workflow's run: the run and step that started it.
const parentRun = computed(() => {
  const parent = (result.value as any)?.metadata?.parent;
  return parent?.pipelineIdentifier && parent?.taskIdentifier ? parent : null;
});
// Opened from a sub-workflow's run: the step that started it is picked.
const focusStep = typeof route.query.step === 'string' ? route.query.step : null;
// Live only while the run is actually going — an old, finished run has no end event in
// this session's stream either.
const isLive = computed(
  () => !hasEnded.value && ['running', 'pending'].includes((result.value as any)?.status)
);
// Waiting at an approval step — can be canceled too (not a debugger pause).
const isWaiting = computed(
  () =>
    !hasEnded.value &&
    (result.value as any)?.status === 'paused' &&
    !!(result.value as any)?.metadata?.approval
);

// Answered from the workflow cache: no steps ran — its outputs came from an earlier run.
const cachedRun = computed(() => {
  const metadata = (result.value as any)?.metadata;
  return metadata?.cached ? { from: metadata.cachedFrom as string | null, at: metadata.cachedAt as string } : null;
});

// The values the run's variables ended with — next to the steps on wide windows (the
// panel can be closed, and stays closed), or behind a Steps | Variables switch otherwise.
const variables = computed<RunVariable[]>(() => (result.value as any)?.variables ?? []);
const isWide = useMediaQuery('(min-width: 1024px)');
const showVariables = useLocalStorage('tipeline:runDetail:showVariables', true);
const narrowView = ref<'steps' | 'variables'>('steps');

// Steps (one line per step) or Timing (steps on a time axis) — remembered across runs.
const stepsView = useLocalStorage<'steps' | 'timing'>('tipeline:runDetail:view', 'steps');
const viewOptions = computed(() =>
  isWide.value ? (['steps', 'timing'] as const) : (['steps', 'timing', 'variables'] as const)
);
const currentView = computed(() =>
  !isWide.value && narrowView.value === 'variables' ? 'variables' : stepsView.value
);
function pickView(view: 'steps' | 'timing' | 'variables') {
  if (view === 'variables') {
    narrowView.value = 'variables';
  } else {
    narrowView.value = 'steps';
    stepsView.value = view;
  }
}

// A running step's bar and duration grow with the clock; a finished run doesn't tick.
const ticking = computed(() => isLive.value || isWaiting.value);
const timestamp = useTimestamp({ interval: 1000 });
const now = computed(() => (ticking.value ? timestamp.value : null));
const runSpan = computed(() => runWindow(timelineActions.value, result.value as any, now.value));

function openSourceRun() {
  if (!cachedRun.value?.from) return;
  router.push({ name: route.name as string, params: { ...route.params, pipelineId: cachedRun.value.from } });
}

watch(result, (newResult: any) => {
  if (!newResult) return;
  usePipelineResult(newResult, timelineActions);
  // Apply any events that were already in the store before this watcher fired.
  // The events watcher only fires on NEW events, so without this, events that
  // arrived before pipelineDetail resolved (or before the component mounted)
  // would never be applied and the timeline would be stuck in the DB snapshot.
  if (events.value.length > 0) {
    applyLiveEvents(timelineActions.value, events.value, newResult.status);
  }
});

// Not deep: `events` is a computed that already returns a new array reference
// whenever the underlying stream store actually changes, so a reference-only
// watch is sufficient to detect new events. A deep watch here previously
// re-subscribed to every nested property of every event — including
// action.result/params objects that applyLiveEvents copies into the
// (also reactive) timelineActions tree — which could make Vue re-fire this
// watcher indefinitely even after no new events were arriving.
watch(events, (newEvents: any[]) => {
  if (newEvents && newEvents.length > 0 && timelineActions.value) {
    applyLiveEvents(timelineActions.value, newEvents, (result.value as any)?.status);
  }
});

// Once the run ends, reload it from the database: the saved statuses are the source of
// truth, and the run status (Live label, cancel button) is only read from there.
watch(hasEnded, (ended) => {
  if (ended) refetch();
});

function getDisplayParams(params: any) {
  if (!params) return {};
  const { actions, ...displayParams } = params;
  return displayParams;
}

function buildTextLog(): string {
  const pipeline = result.value as any;
  const lines: string[] = [`Run ${pipelineId}`];
  if (pipeline?.status) lines.push(`Status: ${pipeline.status}`);
  if (pipeline?.started_at) lines.push(`Started: ${pipeline.started_at}`);
  if (pipeline?.finished_at) lines.push(`Finished: ${pipeline.finished_at}`);
  lines.push('');

  function walk(actions: any[], depth: number) {
    const indent = '  '.repeat(depth);
    for (const action of actions) {
      const label = action.group ? `${action.group}.${action.name}` : action.name;
      lines.push(`${indent}[${(action.status ?? 'pending').toUpperCase()}] ${label}`);
      if (action.started_at) lines.push(`${indent}  started: ${action.started_at}`);
      if (action.finished_at) lines.push(`${indent}  finished: ${action.finished_at}`);
      const params = getDisplayParams(action.params);
      if (Object.keys(params).length > 0) lines.push(`${indent}  params: ${JSON.stringify(params)}`);
      if (action.result !== undefined && action.result !== null) {
        const result = typeof action.result === 'object' ? JSON.stringify(action.result) : action.result;
        lines.push(`${indent}  result: ${result}`);
      }
      if (action.error) {
        const error = typeof action.error === 'object' ? JSON.stringify(action.error) : action.error;
        lines.push(`${indent}  error: ${error}`);
      }
      lines.push('');
      if (stepChildren(action).length > 0) walk(stepChildren(action), depth + 1);
    }
  }
  walk(timelineActions.value, 0);

  if (variables.value.length > 0) {
    lines.push('Variables');
    for (const variable of variables.value) {
      const value = variable.hidden
        ? '(hidden)'
        : typeof variable.value === 'object'
          ? JSON.stringify(variable.value)
          : String(variable.value ?? '');
      lines.push(`  ${variable.name}: ${value}`);
    }
  }
  return lines.join('\n');
}

function buildJsonLog(): string {
  const pipeline = result.value as any;
  return JSON.stringify(
    {
      pipeline: {
        identifier: pipelineId,
        status: pipeline?.status,
        started_at: pipeline?.started_at,
        finished_at: pipeline?.finished_at,
      },
      actions: timelineActions.value,
      variables: variables.value,
    },
    null,
    2
  );
}

async function exportLog(format: 'json' | 'text') {
  const isJson = format === 'json';
  const content = isJson ? buildJsonLog() : buildTextLog();
  const extension = isJson ? 'json' : 'log';
  try {
    const saveResult = await window.ipcRenderer.invoke('dialog:save-file', {
      defaultPath: `run-${pipelineId}.${extension}`,
      content,
      filters: [{ name: isJson ? 'JSON Files' : 'Log Files', extensions: [extension] }],
    });
    if (saveResult?.success) {
      toast.success('Log exported', {
        action: {
          label: 'Show in folder',
          onClick: () => window.ipcRenderer.invoke('shell:show-item-in-folder', saveResult.filePath),
        },
      });
    }
  } catch (e: any) {
    toast.error(e?.message ?? 'Export failed');
  }
}
</script>

<template>
  <div class="overflow-y-hidden flex flex-col h-full w-full">
    <Card class="flex-1 flex flex-col overflow-y-hidden">
      <template #title>
        Run details
        <span v-if="isLive" class="ml-2 text-xs text-muted-foreground">(Live)</span>
      </template>
      <template #description>
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identifier</span>
          <span class="font-mono text-xs text-foreground select-all">{{ pipelineId }}</span>
          <CopyButton :value="pipelineId" />
        </div>
      </template>
      <template #actions>
        <CancelRunButton
          v-if="isLive || isWaiting"
          :target="{ pipelineIdentifier: pipelineId }"
          :waiting="isWaiting"
          @done="() => refetch()"
        />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" :disabled="isLoading">
              <Download class="w-4 h-4 mr-1" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem class="cursor-pointer" @click="exportLog('json')">
              <FileJson class="w-4 h-4 mr-2" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem class="cursor-pointer" @click="exportLog('text')">
              <FileText class="w-4 h-4 mr-2" />
              Export as text
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          v-if="isWide && result"
          :variant="showVariables ? 'secondary' : 'outline'"
          size="sm"
          :title="showVariables ? t('runVariables.hide') : undefined"
          @click="showVariables = !showVariables"
        >
          <Braces class="w-4 h-4 mr-1" />
          {{ t('runVariables.show') }}
        </Button>
        <Button v-if="!inWindow" variant="outline" size="sm" :title="t('runWindow.openHint')" @click="openRunWindow">
          <ExternalLink class="w-4 h-4 mr-1" />
          {{ t('common.openInWindow') }}
        </Button>
        <Button v-if="!inWindow" variant="ghost" size="sm" @click="router.back()">
          <ArrowLeft class="w-4 h-4 mr-1" />
          Back
        </Button>
      </template>
      <template #content>
        <div class="flex-1 h-full flex flex-col min-h-0">
          <RunStepsSkeleton v-if="isLoading && !result" />
          <template v-else>
            <RunSummaryBar
              v-if="result"
              class="mb-3"
              :pipeline="result"
              :actions="timelineActions"
              :window="runSpan"
              :now="now"
            />
            <div
              v-if="parentRun"
              class="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground"
              data-testid="run-called-by"
            >
              <ListTree class="size-4 text-violet-500" />
              {{ t('runDetail.calledBy') }}
              <button
                class="font-medium text-violet-600 hover:underline underline-offset-2 dark:text-violet-400"
                @click="openRun(parentRun.taskIdentifier, parentRun.pipelineIdentifier)"
              >
                {{ parentRun.taskName || parentRun.taskIdentifier }}
              </button>
              <span class="font-mono text-xs">· {{ parentRun.pipelineIdentifier }}</span>
              <span aria-hidden="true">·</span>
              <button
                class="font-medium text-violet-600 hover:underline underline-offset-2 dark:text-violet-400"
                @click="openRun(parentRun.taskIdentifier, parentRun.pipelineIdentifier, parentRun.stepIdentifier)"
              >
                {{ t('runDetail.calledByStep') }}
              </button>
            </div>
            <div v-if="result && (!cachedRun || !isWide)" class="mb-3 inline-flex self-start rounded-md border p-0.5 text-xs" role="tablist">
              <button
                v-for="view in viewOptions"
                :key="view"
                role="tab"
                class="rounded px-2.5 py-1 font-medium transition-colors"
                :class="
                  currentView === view
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-selected="currentView === view"
                :data-view="view"
                @click="pickView(view)"
              >
                {{ t(view === 'steps' ? 'runVariables.steps' : view === 'timing' ? 'runDetail.timing' : 'runVariables.title') }}
                <span v-if="view === 'variables'" class="ml-0.5 text-muted-foreground">{{
                  variables.length
                }}</span>
              </button>
            </div>
            <div class="flex-1 flex min-h-0 gap-4">
              <div v-show="currentView !== 'variables'" class="flex-1 min-w-0 flex flex-col min-h-0">
                <div
                  v-if="cachedRun"
                  class="mb-4 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-sm"
                >
                  <p>{{ t('cache.cachedRun', { date: new Date(cachedRun.at).toLocaleString() }) }}</p>
                  <Button
                    v-if="cachedRun.from"
                    variant="link"
                    size="sm"
                    class="h-auto p-0 text-violet-600 dark:text-violet-300"
                    @click="openSourceRun"
                  >
                    {{ t('cache.openSourceRun') }}
                  </Button>
                </div>
                <!-- No step ran, so there's no step list to show (each would read as pending). -->
                <template v-if="!cachedRun">
                  <RunWaterfall
                    v-if="stepsView === 'timing'"
                    :actions="timelineActions"
                    :window="runSpan"
                    :now="now"
                    :ended="!ticking"
                  />
                  <RunStepList
                    v-else
                    :actions="timelineActions"
                    :window="runSpan"
                    :now="now"
                    :ended="!ticking"
                    :focus="focusStep"
                  />
                </template>
              </div>
              <aside
                v-if="result && (isWide ? showVariables : currentView === 'variables')"
                class="overflow-y-auto"
                :class="isWide ? 'w-80 xl:w-96 shrink-0 border-l pl-4' : 'flex-1 min-w-0'"
              >
                <RunVariablesPanel :variables="variables" :live="isLive || isWaiting" />
              </aside>
            </div>
          </template>
        </div>
      </template>
    </Card>
  </div>
</template>

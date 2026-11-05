<script setup lang="ts">
// The run's steps, one line each: a short input summary, when the step ran inside the
// run (bar) and how long it took. A row opens to its details; failed steps open by
// themselves. Nested steps (loop and branch bodies) are listed under their parent; a
// sub-workflow's steps under the step that ran it, while that step is open.
import { computed, nextTick, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, ExternalLink, ListTree, MessageSquareText } from 'lucide-vue-next';
import RunStepDot from '@/components/run/RunStepDot.vue';
import RunStepDetail from '@/components/run/RunStepDetail.vue';
import { useOpenRun } from '@/composables/useOpenRun';
import {
  averageIteration,
  flattenSteps,
  formatStepDuration,
  hasIterations,
  isSubWorkflowStep,
  iterationSpans,
  stepChildren,
  stepDuration,
  stepLabel,
  stepSpan,
  stepStatus,
  stepSummary,
  type StepRow,
} from '@/utils/runSteps';

const props = defineProps<{
  actions: any[];
  window: { start: number; end: number } | null;
  now: number | null;
  ended?: boolean;
  // A step to open and scroll to (the run page's `?step=`, from a sub-workflow's run).
  focus?: string | null;
}>();

const { t } = useI18n();
const openRun = useOpenRun();

const open = reactive(new Set<string>());
// Failed steps open once, on their own (and a sub-workflow step while its run goes on);
// after that the row is the user's to close.
const autoOpened = new Set<string>();

const rows = computed<StepRow[]>(() =>
  flattenSteps(props.actions, (key, action) => !action.childSteps || open.has(key))
);

watch(
  () =>
    flattenSteps(props.actions)
      .filter((r) => {
        const status = stepStatus(r.action);
        return status === 'failed' || (status === 'running' && !!r.action.childSteps);
      })
      .map((r) => r.key),
  (keys) => {
    for (const key of keys) {
      if (autoOpened.has(key)) continue;
      autoOpened.add(key);
      open.add(key);
    }
  },
  { immediate: true }
);

function toggle(key: string) {
  open.has(key) ? open.delete(key) : open.add(key);
}
function expandAll() {
  flattenSteps(props.actions).forEach((r) => open.add(r.key));
}
function collapseAll() {
  open.clear();
}

watch(
  () => props.focus && rows.value.some((r) => r.key === props.focus),
  async (found) => {
    if (!found || !props.focus) return;
    open.add(props.focus);
    await nextTick();
    document.querySelector(`[data-step="${CSS.escape(props.focus)}"]`)?.scrollIntoView({ block: 'center' });
  },
  { immediate: true }
);

/** The run to open from a sub-workflow step: the one it started, or for a cached step
 *  the run its outputs came from. */
function linkedRun(action: any): { taskId: string; pipelineId: string; cached: boolean } | null {
  if (!isSubWorkflowStep(action)) return null;
  if (action.childRun) return { taskId: action.childRun.taskIdentifier, pipelineId: action.childRun.identifier, cached: false };
  const from = action.result?.cachedFrom;
  const taskId = action.result?.taskIdentifier ?? action.params?.identifier;
  return from && taskId ? { taskId, pipelineId: from, cached: true } : null;
}

function subWorkflowName(action: any): string {
  return action.childRun?.taskName ?? action.params?.identifier ?? '';
}

const span = computed(() => (props.window ? props.window.end - props.window.start : 0));
const pct = (ms: number) => (span.value ? ((ms - props.window!.start) / span.value) * 100 : 0);
const width = (ms: number) => (span.value ? (ms / span.value) * 100 : 0);

/** Bars for a row: one per pass for a loop body, else the step's own span. */
function bars(action: any) {
  if (!props.window) return [];
  if (hasIterations(action)) {
    const passes = iterationSpans(action).filter((s) => s.start !== null && s.end !== null);
    if (passes.length) {
      return passes.slice(0, 500).map((s) => ({
        left: pct(s.start!),
        width: width(s.end! - s.start!),
        cls: s.status === 'failed' ? 'bg-destructive' : s.slow ? 'bg-amber-500' : 'bg-emerald-500/60',
      }));
    }
  }
  const s = stepSpan(action, props.now);
  if (!s) return [];
  const status = stepStatus(action);
  return [
    {
      left: pct(s.start),
      width: width(s.end - s.start),
      cls:
        status === 'failed'
          ? 'bg-destructive'
          : status === 'cached'
            ? 'bg-violet-500'
            : status === 'running'
              ? 'bg-primary animate-pulse'
              : 'bg-emerald-500',
    },
  ];
}

function took(action: any): { text: string; sub?: string; slow?: boolean } {
  if (hasIterations(action)) {
    const avg = averageIteration(action);
    if (avg !== null) return { text: formatStepDuration(avg), sub: t('runDetail.average') };
  }
  const d = stepDuration(action, props.now);
  if (d === null) return { text: '—' };
  return { text: formatStepDuration(d), slow: d >= 1000 };
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2.5">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <button class="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" @click="expandAll">
        {{ t('runDetail.expandAll') }}
      </button>
      <button class="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" @click="collapseAll">
        {{ t('runDetail.collapseAll') }}
      </button>
    </div>

    <div class="flex border-b pb-1.5">
      <div
        class="grid flex-1 items-center gap-2.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        style="grid-template-columns: 16px 20px minmax(0, 1fr) minmax(80px, 180px) 64px"
      >
        <span /><span />
        <span>{{ t('runDetail.step') }}</span>
        <span>{{ window ? t('runDetail.when', { duration: formatStepDuration(window.end - window.start) }) : '' }}</span>
        <span class="text-right">{{ t('runDetail.took') }}</span>
      </div>
      <span class="w-8 shrink-0" />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-fade">
      <div
        v-for="row in rows"
        :key="row.key"
        class="border-b"
        :class="[
          stepStatus(row.action) === 'failed' ? 'bg-destructive/5' : '',
          row.key === focus ? 'ring-1 ring-inset ring-violet-500/60' : '',
        ]"
        data-testid="run-step-row"
        :data-step="row.key"
      >
        <div class="flex items-stretch">
          <button
            class="grid min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-muted/70"
            style="grid-template-columns: 16px 20px minmax(0, 1fr) minmax(80px, 180px) 64px"
            :aria-expanded="open.has(row.key)"
            @click="toggle(row.key)"
          >
            <ChevronRight
              class="size-3.5 text-muted-foreground transition-transform"
              :class="open.has(row.key) ? 'rotate-90' : ''"
            />
            <RunStepDot :action="row.action" />
            <span class="flex min-w-0 items-baseline gap-2.5" :style="{ paddingLeft: `${row.depth * 22}px` }">
              <span class="whitespace-nowrap text-[13.5px] font-semibold">
                <span v-if="row.action.group" class="font-normal text-muted-foreground">{{ row.action.group }}.</span>{{ row.action.name }}
              </span>
              <span
                v-if="isSubWorkflowStep(row.action) && subWorkflowName(row.action)"
                class="flex shrink-0 items-center gap-1 self-center whitespace-nowrap text-[13px] font-medium text-violet-600 dark:text-violet-400"
                data-testid="run-step-subworkflow"
              >
                <ListTree class="size-3.5" />
                {{ subWorkflowName(row.action) }}
                <span
                  v-if="row.action.childRuns?.length > 1"
                  class="font-mono text-[10.5px] font-normal text-muted-foreground"
                  :title="t('runDetail.subWorkflowRuns', { count: row.action.childRuns.length }, row.action.childRuns.length)"
                >
                  ×{{ row.action.childRuns.length }}
                </span>
              </span>
              <span
                v-if="row.action.cached"
                class="self-center rounded border border-violet-500/30 bg-violet-500/10 px-1 text-[10px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300"
                :title="t('cache.cachedStepTitle')"
              >
                {{ t('cache.cachedBadge') }}
              </span>
              <span
                v-if="hasIterations(row.action)"
                class="self-center rounded border px-1 font-mono text-[10.5px] text-muted-foreground"
                :title="t('runDetail.iterations', { count: row.action.iterations.length }, row.action.iterations.length)"
              >
                ×{{ row.action.iterations.length }}
              </span>
              <span
                v-if="row.action.comment"
                class="flex min-w-0 shrink items-center gap-1 self-center truncate text-xs text-foreground/75"
                :title="row.action.comment"
              >
                <MessageSquareText class="size-3 shrink-0 text-foreground/50" />
                <span class="truncate">{{ row.action.comment }}</span>
              </span>
              <span
                v-if="row.hasChildren"
                class="self-center whitespace-nowrap text-xs text-muted-foreground"
              >
                {{ t('runDetail.childSteps', { count: stepChildren(row.action).length }, stepChildren(row.action).length) }}
              </span>
              <span class="min-w-0 truncate font-mono text-xs text-muted-foreground">{{ stepSummary(row.action) }}</span>
            </span>
            <span class="relative h-2 overflow-hidden rounded-sm bg-muted" :aria-label="stepLabel(row.action)">
              <i
                v-for="(bar, i) in bars(row.action)"
                :key="i"
                class="absolute inset-y-0 min-w-[2px] rounded-sm"
                :class="bar.cls"
                :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
              />
            </span>
            <span class="text-right text-[12.5px] tabular-nums leading-tight" :class="took(row.action).slow ? 'font-semibold' : ''">
              {{ took(row.action).text }}
              <small v-if="took(row.action).sub" class="block text-[10.5px] text-muted-foreground">{{ took(row.action).sub }}</small>
            </span>
          </button>
          <span class="flex w-8 shrink-0 items-center justify-center">
            <button
              v-if="linkedRun(row.action)"
              class="rounded p-1 text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400"
              :title="t(linkedRun(row.action)!.cached ? 'cache.openSourceRun' : 'runDetail.openChildRun')"
              :aria-label="t(linkedRun(row.action)!.cached ? 'cache.openSourceRun' : 'runDetail.openChildRun')"
              data-testid="run-step-open-run"
              @click="openRun(linkedRun(row.action)!.taskId, linkedRun(row.action)!.pipelineId)"
            >
              <ExternalLink class="size-3.5" />
            </button>
          </span>
        </div>
        <div
          v-if="open.has(row.key)"
          class="pb-3.5 pr-2.5 pt-0.5"
          :style="{ paddingLeft: `${58 + row.depth * 22}px` }"
        >
          <RunStepDetail :action="row.action" :ended="ended" />
        </div>
      </div>
    </div>
  </div>
</template>

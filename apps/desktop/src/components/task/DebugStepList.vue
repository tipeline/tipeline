<script setup lang="ts">
// The debugger's step list: one row per step with the builder's row number, its name,
// what it did (Result) and how long it took. Picking a row shows the step in the Step
// tab below; the list keeps the step the run is on in view. The dot left of the number
// is a breakpoint: a debug run pauses before that step. A sub-workflow step lists the
// steps of the run it started under it ("5.1", "5.2"), or, until it runs, the
// sub-workflow as saved (folded, dimmed: open it to set a breakpoint in it).
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, ListTree } from 'lucide-vue-next';
import RunStepDot from '@/components/run/RunStepDot.vue';
import { useActionT } from '@/composables/useActionT';
import { subWorkflowName } from '@/composables/useDebugTimeline';
import {
  averageIteration,
  flattenSteps,
  isSubWorkflowStep,
  formatStepDuration,
  hasIterations,
  stepDuration,
  stepLabel,
  stepResult,
  stepStatus,
  type StepRow,
} from '@/utils/runSteps';

const props = defineProps<{
  actions: any[];
  ended: boolean;
  selectedKey?: string | null;
  /** Rows with a breakpoint (their keys); no dots to click when not given. */
  breakpoints?: string[];
  /** Each row's number ("5", "5.2"), by key; else its place in the list. */
  labels?: Record<string, string>;
}>();

const emit = defineEmits<{ select: [key: string]; toggleBreakpoint: [key: string] }>();

const { t } = useI18n();
const { tAction } = useActionT();

// Sub-workflow steps opened or folded by hand; otherwise a run's steps are listed and a
// sub-workflow that hasn't run yet is folded.
const folded = reactive(new Map<string, boolean>());
const isFolded = (key: string, action: any) => folded.get(key) ?? !!action.childPreview;
function toggleFold(key: string, action: any) {
  folded.set(key, !isFolded(key, action));
}

const rows = computed<StepRow[]>(() =>
  flattenSteps(props.actions, (key, action) => !action.childSteps || !isFolded(key, action))
);
/** Rows of a sub-workflow that hasn't run yet: dimmed. */
const isPreview = (key: string): boolean => {
  const cut = key.lastIndexOf('>');
  if (cut < 0) return false;
  const above = rows.value.find((r) => r.key === key.slice(0, cut));
  return !!above?.action.childPreview || (above ? isPreview(above.key) : false);
};

/** The step's own name: its comment, else the action's label ("Request"). */
const title = (action: any) => action.comment || tAction(action.group, action.name);

function result(action: any) {
  const r = stepResult(action, props.ended);
  if (!r) return null;
  return {
    text: r.text ?? t(`runDetail.result.${r.key}`, { count: r.count ?? 0 }, r.count ?? 0),
    tone: r.tone,
  };
}

function took(action: any): string {
  if (hasIterations(action)) {
    const avg = averageIteration(action);
    if (avg !== null) return `${formatStepDuration(avg)} ${t('runDetail.average')}`;
  }
  const d = stepDuration(action, null);
  return d === null ? '' : formatStepDuration(d);
}

const listRef = ref<HTMLElement | null>(null);
watch(
  () => props.selectedKey,
  (key) => {
    if (!key) return;
    nextTick(() => {
      listRef.value?.querySelector(`[data-step="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }
);

const COLUMNS = '14px 24px 18px minmax(0, 1fr) auto 72px';
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      class="grid items-center gap-2.5 border-b px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground"
      :style="{ gridTemplateColumns: COLUMNS }"
    >
      <span />
      <span class="text-right">#</span>
      <span />
      <span>{{ t('runDetail.step') }}</span>
      <span>{{ t('runDetail.resultColumn') }}</span>
      <span class="text-right">{{ t('runDetail.took') }}</span>
    </div>

    <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto scroll-fade py-1">
      <div
        v-for="(row, index) in rows"
        :key="row.key"
        class="group/row relative grid w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/70"
        :class="[
          selectedKey === row.key ? 'bg-blue-500/10 shadow-[inset_3px_0_0_var(--color-blue-500)] hover:bg-blue-500/15' : '',
          stepStatus(row.action) === 'failed' && selectedKey !== row.key ? 'bg-destructive/5' : '',
          stepStatus(row.action) === 'skipped' || isPreview(row.key) ? 'opacity-50' : '',
        ]"
        :style="{ gridTemplateColumns: COLUMNS }"
        data-testid="debug-step-row"
        :data-step="row.key"
      >
        <!-- The row's own click target, under the breakpoint dot. -->
        <button
          type="button"
          class="absolute inset-0 rounded-md"
          :aria-pressed="selectedKey === row.key"
          :aria-label="title(row.action)"
          data-testid="debug-step-select"
          @click="emit('select', row.key)"
        />
        <button
          v-if="breakpoints"
          type="button"
          class="relative z-10 flex size-3.5 items-center justify-center rounded-full"
          :title="breakpoints.includes(row.key) ? t('debugInspector.removeBreakpoint') : t('debugInspector.addBreakpoint')"
          :aria-pressed="breakpoints.includes(row.key)"
          data-testid="debug-breakpoint"
          @click.stop="emit('toggleBreakpoint', row.key)"
        >
          <span
            class="size-2.5 rounded-full"
            :class="breakpoints.includes(row.key) ? 'bg-red-600' : 'border border-dashed border-muted-foreground/50 opacity-0 group-hover/row:opacity-100'"
          />
        </button>
        <span v-else />
        <span class="pointer-events-none text-right text-xs tabular-nums text-muted-foreground">{{ labels?.[row.key] ?? index + 1 }}</span>
        <RunStepDot class="pointer-events-none" :action="row.action" small />
        <span class="pointer-events-none flex min-w-0 items-baseline gap-2" :style="{ paddingLeft: `${row.depth * 22}px` }">
          <span class="truncate text-[13px] font-medium">{{ title(row.action) }}</span>
          <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{{ stepLabel(row.action) }}</span>
          <!-- Its own button (the row's click target is under it): fold or open its steps. -->
          <button
            v-if="isSubWorkflowStep(row.action) && subWorkflowName(row.action)"
            type="button"
            class="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1 self-center rounded px-1 text-[12px] font-medium text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
            :title="row.action.childSteps ? (isFolded(row.key, row.action) ? t('debugInspector.showSubSteps') : t('debugInspector.hideSubSteps')) : undefined"
            :aria-expanded="row.action.childSteps ? !isFolded(row.key, row.action) : undefined"
            data-testid="debug-subworkflow"
            @click.stop="row.action.childSteps && toggleFold(row.key, row.action)"
          >
            <ChevronRight
              v-if="row.action.childSteps"
              class="size-3 transition-transform"
              :class="isFolded(row.key, row.action) ? '' : 'rotate-90'"
            />
            <ListTree class="size-3.5" />
            {{ subWorkflowName(row.action) }}
            <span
              v-if="row.action.childRunKeys?.length > 1"
              class="font-mono text-[10.5px] font-normal text-muted-foreground"
              :title="t('debugInspector.subRunShown', { count: row.action.childRunKeys.length })"
            >
              ×{{ row.action.childRunKeys.length }}
            </span>
          </button>
          <span
            v-if="row.action.next"
            class="shrink-0 self-center rounded bg-blue-500/15 px-1 text-[9.5px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300"
          >
            {{ t('runDetail.next') }}
          </span>
          <span
            v-else-if="stepStatus(row.action) === 'skipped'"
            class="shrink-0 self-center rounded border px-1 text-[9.5px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ t('runDetail.skipped') }}
          </span>
          <span
            v-if="row.action.cached"
            class="shrink-0 self-center rounded border border-violet-500/30 bg-violet-500/10 px-1 text-[9.5px] font-medium uppercase tracking-wide text-violet-600 dark:text-violet-300"
            :title="t('cache.cachedStepTitle')"
          >
            {{ t('cache.cachedBadge') }}
          </span>
        </span>
        <span
          v-if="result(row.action)"
          class="pointer-events-none max-w-64 truncate rounded px-2 py-0.5 font-mono text-[11px]"
          :class="{
            'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300': result(row.action)!.tone === 'done',
            'bg-blue-500/10 text-blue-700 dark:text-blue-300': result(row.action)!.tone === 'active',
            'bg-destructive/10 text-destructive': result(row.action)!.tone === 'failed',
            'bg-muted text-muted-foreground': result(row.action)!.tone === 'muted',
          }"
          :title="result(row.action)!.text"
          data-testid="debug-step-result"
        >
          {{ result(row.action)!.text }}
        </span>
        <span v-else />
        <span class="pointer-events-none text-right text-xs tabular-nums text-muted-foreground">{{ took(row.action) }}</span>
      </div>
    </div>
  </div>
</template>

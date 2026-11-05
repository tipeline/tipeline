<script setup lang="ts">
// A step's details on the run page: its error, input, output, loop iterations and the
// runs it started. Shared by the Steps list (opened row) and the Timing chart (panel).
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCheck, ChevronDown, ChevronUp, Copy, ExternalLink, ListTree, X } from 'lucide-vue-next';
import { safeStringify, exceedsDisplayThreshold } from '@/utils/truncateValue';
import JsonTree from '@/components/run/JsonTree.vue';
import { useOpenRun } from '@/composables/useOpenRun';
import type { ChildRun } from '@/utils/childRuns';
import {
  formatStepDuration,
  hasIterations,
  isSubWorkflowStep,
  iterationSpans,
  stepLabel,
  stepStatus,
} from '@/utils/runSteps';

const props = defineProps<{
  action: any;
  // The run is over: a step still pending never ran.
  ended?: boolean;
  // An object or list output as a collapsible tree (the debugger), not as text.
  tree?: boolean;
}>();

const { t } = useI18n();
const openRun = useOpenRun();

const MAX_ITERATIONS_SHOWN = 300;

const status = computed(() => stepStatus(props.action));
const params = computed(() => {
  const { actions, ...rest } = props.action?.params ?? {};
  return rest as Record<string, unknown>;
});
const hasParams = computed(() => Object.keys(params.value).length > 0);
const hasResult = computed(() => props.action?.result !== undefined && props.action?.result !== null);

function formatValue(value: unknown, indent?: number): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) return `[${value.join(', ')}]`;
  if (typeof value === 'object') return safeStringify(value, indent);
  return String(value);
}

const paramsOpen = ref(false);
const resultOpen = ref(false);
const longParams = computed(() => Object.values(params.value).some((v) => formatValue(v).length > 120));
const paramText = (v: unknown) => {
  const s = formatValue(v);
  return !paramsOpen.value && s.length > 120 ? s.slice(0, 120) + '…' : s;
};
const resultText = computed(() => formatValue(props.action?.result, 2));
const longResult = computed(() => !showTree.value && exceedsDisplayThreshold(resultText.value, 300, 3));
const showTree = computed(() => !!props.tree && typeof props.action?.result === 'object' && props.action?.result !== null);

const copied = ref(false);
async function copyResult() {
  try {
    await navigator.clipboard.writeText(resultText.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused: nothing to do, the value is selectable.
  }
}

// Loop body: every pass, the slow ones marked; pick one to read its output.
const iterations = computed(() => (hasIterations(props.action) ? iterationSpans(props.action) : []));
const slowCount = computed(() => iterations.value.filter((i) => i.slow).length);
const selectedIteration = ref<number | null>(null);
watch(
  () => props.action,
  () => (selectedIteration.value = null)
);
const picked = computed(() => {
  if (selectedIteration.value === null) return null;
  const idx = iterations.value.findIndex((i) => i.index === selectedIteration.value);
  return idx < 0 ? null : { span: iterations.value[idx], data: props.action.iterations[idx] };
});

// A sub-workflow step: the runs it started (several when it ran in a loop; the run page
// attaches them, see childRuns.ts), or for a cached one the run its outputs came from.
const childRuns = computed<ChildRun[]>(() => (isSubWorkflowStep(props.action) ? (props.action.childRuns ?? []) : []));
const cachedFrom = computed(() => {
  if (!isSubWorkflowStep(props.action) || childRuns.value.length) return null;
  const pipelineId = props.action.result?.cachedFrom;
  const taskId = props.action.result?.taskIdentifier ?? props.action.params?.identifier;
  return pipelineId && taskId ? { pipelineId, taskId } : null;
});
const runDotClass = (status: string) =>
  status === 'failed'
    ? 'border-destructive bg-destructive text-destructive-foreground'
    : status === 'running' || status === 'paused'
      ? 'border-primary bg-primary/15 animate-pulse'
      : status === 'canceled'
        ? 'border-muted-foreground/40 bg-muted'
        : 'border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/30';
</script>

<template>
  <div class="grid gap-4 text-xs md:grid-cols-2" data-testid="run-step-detail">
    <!-- Error first: it's why the row is open. -->
    <div
      v-if="action.error"
      class="md:col-span-2 flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5"
    >
      <span class="flex items-center gap-1.5 font-semibold text-destructive">
        <X class="size-3.5" />
        {{ t('runDetail.failedStep', { step: stepLabel(action) }) }}
      </span>
      <span class="font-mono whitespace-pre-wrap break-words text-foreground/90">{{ formatValue(action.error) }}</span>
    </div>

    <div class="flex flex-col gap-1.5 min-w-0">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ t('runDetail.input') }}</p>
      <div v-if="hasParams" class="grid gap-x-3 gap-y-0.5" style="grid-template-columns: auto minmax(0, 1fr)">
        <template v-for="(value, key) in params" :key="key">
          <span class="text-muted-foreground font-medium">{{ key }}</span>
          <span class="font-mono text-foreground/85 whitespace-pre-wrap break-words">{{ paramText(value) }}</span>
        </template>
      </div>
      <p v-else class="text-muted-foreground">{{ t('runDetail.noInput') }}</p>
      <button
        v-if="longParams"
        class="flex items-center gap-0.5 self-start font-medium text-blue-500 hover:underline underline-offset-2 dark:text-blue-400"
        @click="paramsOpen = !paramsOpen"
      >
        <component :is="paramsOpen ? ChevronUp : ChevronDown" class="size-3" />
        {{ paramsOpen ? t('runDetail.showLess') : t('runDetail.showMore') }}
      </button>
    </div>

    <!-- Loop body: one square per pass. -->
    <div v-if="iterations.length" class="flex flex-col gap-1.5 min-w-0">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('runDetail.iterations', { count: iterations.length }, iterations.length) }}
        <span v-if="slowCount" class="text-amber-600 dark:text-amber-400">· {{ t('runDetail.slowIterations', { count: slowCount }, slowCount) }}</span>
      </p>
      <div class="flex flex-wrap gap-[3px]">
        <button
          v-for="it in iterations.slice(0, MAX_ITERATIONS_SHOWN)"
          :key="it.index"
          class="size-[18px] rounded-[3px] border font-mono text-[9px] leading-none text-muted-foreground transition-colors"
          :class="[
            it.status === 'failed'
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : it.slow
                ? 'border-amber-500 bg-amber-500 text-white'
                : 'border-emerald-500/70 bg-emerald-500/15 hover:bg-emerald-500/30',
            selectedIteration === it.index ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : '',
          ]"
          :title="
            it.duration !== null
              ? `${t('runDetail.iteration', { index: it.index })} · ${formatStepDuration(it.duration)}`
              : t('runDetail.iteration', { index: it.index })
          "
          :aria-pressed="selectedIteration === it.index"
          @click="selectedIteration = selectedIteration === it.index ? null : it.index"
        >
          {{ iterations.length <= 99 ? it.index : '' }}
        </button>
      </div>
      <p v-if="iterations.length > MAX_ITERATIONS_SHOWN" class="text-muted-foreground">
        {{ t('runDetail.moreIterations', { count: iterations.length - MAX_ITERATIONS_SHOWN }) }}
      </p>
      <div v-if="picked" class="flex flex-col gap-1">
        <span class="text-muted-foreground">
          {{ t('runDetail.iteration', { index: picked.span.index }) }}
          <template v-if="picked.span.duration !== null"> · {{ formatStepDuration(picked.span.duration) }}</template>
        </span>
        <span v-if="picked.data.error" class="text-destructive break-words">{{ formatValue(picked.data.error) }}</span>
        <span
          v-else-if="picked.data.result !== undefined && picked.data.result !== null"
          class="font-mono whitespace-pre-wrap break-words rounded bg-muted px-2 py-1"
          >{{ formatValue(picked.data.result, 2) }}</span
        >
        <span v-else class="text-muted-foreground">{{ t('runDetail.noOutput') }}</span>
      </div>
      <p v-else class="text-muted-foreground">{{ t('runDetail.pickIteration') }}</p>
    </div>

    <div v-else-if="hasResult" class="flex flex-col gap-1.5 min-w-0">
      <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {{ t('runDetail.output') }}
        <span v-if="action.destination" class="ml-1 normal-case tracking-normal font-medium text-emerald-700 dark:text-emerald-400">
          {{ t('runDetail.savedTo', { name: action.destination }) }}
        </span>
      </p>
      <div class="relative rounded bg-muted">
        <div v-if="showTree" class="max-h-64 overflow-auto px-1.5 py-1.5 pr-8">
          <JsonTree :value="action.result" />
        </div>
        <div v-else class="overflow-x-auto px-2.5 py-2 pr-8">
          <span
            class="block font-mono whitespace-pre text-foreground/90"
            :style="resultOpen ? {} : { maxHeight: '7.5em', overflow: 'hidden' }"
            >{{ resultText }}</span
          >
        </div>
        <button
          class="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
          :title="t('runDetail.copy')"
          @click="copyResult"
        >
          <CheckCheck v-if="copied" class="size-3.5 text-emerald-500" />
          <Copy v-else class="size-3.5" />
        </button>
      </div>
      <button
        v-if="longResult"
        class="flex items-center gap-0.5 self-start font-medium text-blue-500 hover:underline underline-offset-2 dark:text-blue-400"
        @click="resultOpen = !resultOpen"
      >
        <component :is="resultOpen ? ChevronUp : ChevronDown" class="size-3" />
        {{ resultOpen ? t('runDetail.showLess') : t('runDetail.showMore') }}
      </button>
    </div>

    <p v-else-if="status === 'skipped'" class="text-muted-foreground self-start">
      {{ t('runDetail.skippedNote') }}
    </p>
    <p v-else-if="status === 'pending'" class="text-muted-foreground self-start">
      {{ ended ? t('runDetail.notRunNote') : t('runDetail.waitingNote') }}
    </p>

    <div v-if="childRuns.length" class="md:col-span-2 flex flex-col gap-1.5" data-testid="run-step-child-runs">
      <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTree class="size-3.5 text-violet-500" />
        {{ t('runDetail.subWorkflowRuns', { count: childRuns.length }, childRuns.length) }}
      </p>
      <!-- One run: a link. Several (the step ran in a loop): one square per run. -->
      <button
        v-if="childRuns.length === 1"
        class="flex items-center gap-1 self-start font-medium text-violet-600 hover:underline underline-offset-2 dark:text-violet-400"
        @click="openRun(childRuns[0].taskIdentifier, childRuns[0].identifier)"
      >
        <ExternalLink class="size-3" />
        {{ t('runDetail.openChildRun') }}
      </button>
      <div v-else class="flex flex-wrap gap-[3px]">
        <button
          v-for="(run, i) in childRuns.slice(0, MAX_ITERATIONS_SHOWN)"
          :key="run.identifier"
          class="size-[18px] rounded-[3px] border font-mono text-[9px] leading-none text-muted-foreground transition-colors"
          :class="[
            runDotClass(run.status),
            run.identifier === action.childRun?.identifier ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-background' : '',
          ]"
          :title="t('runDetail.openChildRunNumber', { index: i + 1 })"
          @click="openRun(run.taskIdentifier, run.identifier)"
        >
          {{ childRuns.length <= 99 ? i + 1 : '' }}
        </button>
      </div>
      <p v-if="childRuns.length > 1 && action.childRun" class="text-muted-foreground">
        {{ t('runDetail.subWorkflowShown', { index: childRuns.indexOf(action.childRun) + 1 }) }}
      </p>
    </div>
    <button
      v-else-if="cachedFrom"
      class="md:col-span-2 flex items-center gap-1 self-start font-medium text-violet-600 hover:underline underline-offset-2 dark:text-violet-400"
      @click="openRun(cachedFrom.taskId, cachedFrom.pipelineId)"
    >
      <ExternalLink class="size-3" />
      {{ t('cache.openSourceRun') }}
    </button>
  </div>
</template>

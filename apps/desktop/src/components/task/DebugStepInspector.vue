<script setup lang="ts">
// The debugger's Step tab: one step of the debug run — its error, input, output and
// loop passes, the same details as the run page — so there's no need to leave for it.
// The step the run waits at shows the input it will run with, and what can be done
// there: run it, skip it, edit it, or (a failed one) run it again.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCheck, Copy, ExternalLink, Pencil, Play, RotateCcw, SkipForward, TriangleAlert } from 'lucide-vue-next';
import RunStepDetail from '@/components/run/RunStepDetail.vue';
import { Button } from '@/components/ui/button';
import { useActionT } from '@/composables/useActionT';
import { averageIteration, formatStepDuration, hasIterations, stepDuration, stepLabel, stepStatus } from '@/utils/runSteps';
import { safeStringify } from '@/utils/truncateValue';

const props = defineProps<{
  action: any | null;
  /** The debug run is over: a pending step never ran. */
  ended: boolean;
  /** Set once the run has started; the run page needs it. */
  canOpenRun: boolean;
  /** The step can be edited (the workflow's own steps, not a sub-workflow's). */
  canEdit?: boolean;
  /** The step's settings as saved, to say which input came out empty. */
  rawParams?: Record<string, unknown> | null;
}>();

const emit = defineEmits<{ openRun: []; run: []; skip: []; retry: []; edit: [] }>();

const { t } = useI18n();
const { tAction } = useActionT();

const status = computed(() => {
  if (!props.action) return null;
  if (props.action.next) return 'next';
  const s = stepStatus(props.action);
  return s === 'pending' && props.ended ? 'notRun' : s;
});

const title = computed(() =>
  props.action ? props.action.comment || tAction(props.action.group, props.action.name) : ''
);

// "412ms", or a loop body's average pass and how many passes.
const took = computed(() => {
  if (!props.action) return '';
  if (hasIterations(props.action)) {
    const avg = averageIteration(props.action);
    const passes = t('runDetail.iterations', { count: props.action.iterations.length }, props.action.iterations.length);
    return avg === null ? passes : `${passes} · ${formatStepDuration(avg)} ${t('runDetail.average')}`;
  }
  const d = stepDuration(props.action, null);
  return d === null ? '' : formatStepDuration(d);
});

// The step the run waits at: before it (next), or after it failed (waiting).
const waitingNext = computed(() => props.action?.next === true);
const waitingFailed = computed(() => props.action?.waiting === true);

// Before it runs, its input is the one Core filled in for it.
const shown = computed(() => {
  if (!props.action || !waitingNext.value || !props.action.nextParams) return props.action;
  const { actions } = props.action.params ?? {};
  return { ...props.action, params: { ...props.action.nextParams, ...(actions ? { actions } : {}) } };
});

/** Inputs written as a template that came out empty: "cc came out empty". */
const emptyInputs = computed(() => {
  if (!waitingNext.value || !props.action?.nextParams || !props.rawParams) return [];
  return Object.entries(props.action.nextParams as Record<string, unknown>)
    .filter(([key, value]) => {
      const raw = props.rawParams?.[key];
      const templated = typeof raw === 'string' && /\{\{|\{=/.test(raw);
      return templated && (value === '' || value === null || value === undefined);
    })
    .map(([key]) => ({ key, template: String(props.rawParams?.[key]) }));
});

const copied = ref(false);
async function copyStep() {
  const { actions, ...input } = shown.value?.params ?? {};
  const text = safeStringify(
    {
      step: stepLabel(props.action),
      status: stepStatus(props.action),
      ...(props.action.error ? { error: props.action.error } : {}),
      input,
      ...(props.action.result !== undefined ? { output: props.action.result } : {}),
    },
    2
  );
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard refused: the values are selectable in the panel.
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" data-testid="debug-step-inspector">
    <p v-if="!action" class="px-3 py-4 text-center text-xs text-muted-foreground">{{ t('debugInspector.pickStep') }}</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2">
        <span
          v-if="status"
          class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          :class="{
            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300': status === 'completed',
            'bg-violet-500/15 text-violet-700 dark:text-violet-300': status === 'cached',
            'bg-destructive/15 text-destructive': status === 'failed',
            'bg-blue-500/15 text-blue-700 dark:text-blue-300': status === 'running' || status === 'next',
            'bg-muted text-muted-foreground': status === 'pending' || status === 'notRun' || status === 'skipped',
          }"
          :data-status="status"
        >
          {{ t(`debugInspector.status.${status}`) }}
        </span>
        <span class="truncate text-sm font-semibold">{{ title }}</span>
        <span class="font-mono text-xs text-muted-foreground">{{ stepLabel(action) }}<template v-if="took"> · {{ took }}</template></span>
        <div class="ml-auto flex flex-wrap items-center gap-1">
          <template v-if="waitingNext">
            <Button size="sm" class="h-7" data-testid="debug-run-step" @click="emit('run')">
              <Play class="mr-1 size-3.5" />
              {{ t('debugInspector.runStep') }}
            </Button>
            <Button variant="outline" size="sm" class="h-7" data-testid="debug-skip-step" @click="emit('skip')">
              <SkipForward class="mr-1 size-3.5" />
              {{ t('debugInspector.skipStep') }}
            </Button>
          </template>
          <template v-else-if="waitingFailed">
            <Button size="sm" class="h-7" data-testid="debug-retry-step" @click="emit('retry')">
              <RotateCcw class="mr-1 size-3.5" />
              {{ hasIterations(action) ? t('debugInspector.retryPass', { pass: action.iterations.length }) : t('debugInspector.retryStep') }}
            </Button>
            <Button variant="outline" size="sm" class="h-7" data-testid="debug-skip-step" @click="emit('skip')">
              <SkipForward class="mr-1 size-3.5" />
              {{ t('debugInspector.skipAndGoOn') }}
            </Button>
          </template>
          <Button v-if="canEdit" variant="outline" size="sm" class="h-7" data-testid="debug-edit-step" @click="emit('edit')">
            <Pencil class="mr-1 size-3.5" />
            {{ t('debugInspector.editStep') }}
          </Button>
          <Button variant="ghost" size="sm" class="h-7" @click="copyStep">
            <CheckCheck v-if="copied" class="mr-1 size-3.5 text-emerald-500" />
            <Copy v-else class="mr-1 size-3.5" />
            {{ t('debugInspector.copyStep') }}
          </Button>
          <Button v-if="canOpenRun" variant="ghost" size="sm" class="h-7" :title="t('runWindow.openHint')" @click="emit('openRun')">
            <ExternalLink class="mr-1 size-3.5" />
            {{ t('debugInspector.openRun') }}
          </Button>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scroll-fade">
        <template v-if="waitingNext">
          <p class="mb-2 text-xs text-muted-foreground">{{ t('debugInspector.willRunWith') }}</p>
          <div
            v-if="action.nextParamsError"
            class="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
            <span>{{ t('debugInspector.inputError', { error: action.nextParamsError }) }}</span>
          </div>
          <div
            v-for="item in emptyInputs"
            :key="item.key"
            class="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
            data-testid="debug-empty-input"
          >
            <TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
            <span>{{ t('debugInspector.emptyInput', { key: item.key, template: item.template }) }}</span>
          </div>
        </template>
        <p v-else-if="waitingFailed" class="mb-3 text-xs text-muted-foreground">{{ t('debugInspector.failedNote') }}</p>
        <RunStepDetail :action="shown" :ended="ended" tree />
      </div>
    </template>
  </div>
</template>

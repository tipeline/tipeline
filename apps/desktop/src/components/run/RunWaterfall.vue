<script setup lang="ts">
// The run's steps on a time axis: one row per step, a bar from its start to its end, and
// a loop body's passes as separate bars. Selecting a row shows its details underneath.
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight } from 'lucide-vue-next';
import RunStepDot from '@/components/run/RunStepDot.vue';
import RunStepDetail from '@/components/run/RunStepDetail.vue';
import {
  axisTicks,
  firstFailed,
  flattenSteps,
  formatClock,
  formatStepDuration,
  formatTick,
  hasIterations,
  iterationSpans,
  stepSpan,
  stepStatus,
} from '@/utils/runSteps';

const props = defineProps<{
  actions: any[];
  window: { start: number; end: number } | null;
  now: number | null;
  ended?: boolean;
}>();

const { t } = useI18n();

const collapsed = reactive(new Set<string>());
const rows = computed(() => flattenSteps(props.actions, (key) => !collapsed.has(key)));
const all = computed(() => flattenSteps(props.actions));

// Open on the failed step, else the one running; the user's pick wins after that.
const selectedKey = ref<string | null>(null);
const userPicked = ref(false);
watch(
  all,
  (list) => {
    if (userPicked.value) return;
    const failed = firstFailed(props.actions);
    const running = list.filter((r) => stepStatus(r.action) === 'running').pop();
    selectedKey.value = failed?.key ?? running?.key ?? selectedKey.value;
  },
  { immediate: true }
);
const selected = computed(() => all.value.find((r) => r.key === selectedKey.value) ?? null);
function select(key: string) {
  selectedKey.value = key;
  userPicked.value = true;
}
function toggleChildren(key: string) {
  collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key);
}

const span = computed(() => (props.window ? props.window.end - props.window.start : 0));
const ticks = computed(() => axisTicks(span.value));
const pct = (ms: number) => (span.value ? ((ms - props.window!.start) / span.value) * 100 : 0);

function bars(action: any) {
  if (!props.window) return [];
  if (hasIterations(action)) {
    const passes = iterationSpans(action).filter((s) => s.start !== null && s.end !== null);
    if (passes.length) {
      return passes.slice(0, 1000).map((s) => ({
        left: pct(s.start!),
        width: pct(s.end!) - pct(s.start!),
        cls: s.status === 'failed' ? 'bg-destructive' : s.slow ? 'bg-amber-500' : 'bg-emerald-500/70',
        thin: true,
        title: `${t('runDetail.iteration', { index: s.index })} · ${formatStepDuration(s.end! - s.start!)}`,
      }));
    }
  }
  const s = stepSpan(action, props.now);
  if (!s) return [];
  const status = stepStatus(action);
  return [
    {
      left: pct(s.start),
      width: pct(s.end) - pct(s.start),
      cls:
        status === 'failed'
          ? 'bg-destructive'
          : status === 'cached'
            ? 'bg-violet-500'
            : status === 'running'
              ? 'bg-primary animate-pulse'
              : 'bg-emerald-500',
      thin: false,
      title: formatStepDuration(s.end - s.start),
    },
  ];
}

/** The duration next to the bar: after it, or before it when the bar ends near the edge. */
function barLabel(action: any): { text: string; style: Record<string, string> } | null {
  if (!props.window) return null;
  const passes = hasIterations(action)
    ? iterationSpans(action).filter((s) => s.start !== null && s.end !== null)
    : [];
  let start: number, end: number, text: string;
  if (passes.length) {
    start = Math.min(...passes.map((p) => p.start!));
    end = Math.max(...passes.map((p) => p.end!));
    const total = passes.reduce((a, p) => a + (p.end! - p.start!), 0);
    text = t('runDetail.totalOverIterations', { duration: formatStepDuration(total), count: passes.length });
  } else {
    const s = stepSpan(action, props.now);
    if (!s) {
      return stepStatus(action) === 'pending'
        ? { text: props.ended ? t('runDetail.notRun') : t('runDetail.waiting'), style: { left: '4px' } }
        : null;
    }
    ({ start, end } = s);
    text = formatStepDuration(end - start);
  }
  const right = pct(end);
  return right > 78
    ? { text, style: { right: `calc(${100 - pct(start)}% + 6px)` } }
    : { text, style: { left: `calc(${right}% + 6px)` } };
}

const selectedSpan = computed(() => (selected.value ? stepSpan(selected.value.action, props.now) : null));
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-2.5">
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2 w-2.5 rounded-sm bg-emerald-500" />{{ t('runDetail.legend.completed') }}</span>
      <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2 w-2.5 rounded-sm bg-violet-500" />{{ t('runDetail.legend.cached') }}</span>
      <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2 w-2.5 rounded-sm bg-destructive" />{{ t('runDetail.legend.failed') }}</span>
      <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2 w-2.5 rounded-sm bg-amber-500" />{{ t('runDetail.legend.slowIteration') }}</span>
      <span class="ml-auto">{{ t('runDetail.selectHint') }}</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto rounded-md border" data-testid="run-waterfall">
      <p v-if="!window" class="p-4 text-sm text-muted-foreground">{{ t('runDetail.noTiming') }}</p>
      <div v-else class="grid" style="grid-template-columns: minmax(160px, 240px) minmax(0, 1fr)">
        <div class="sticky top-0 z-10 flex h-7 items-center border-b border-r bg-card pl-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {{ t('runDetail.step') }}
        </div>
        <div class="sticky top-0 z-10 h-7 border-b bg-card">
          <div class="relative mr-14 h-full">
            <span
              v-for="tick in ticks"
              :key="tick"
              class="absolute inset-y-0 border-l pl-1 text-[10.5px] leading-7 tabular-nums text-muted-foreground"
              :style="{ left: `${(tick / span) * 100}%` }"
            >{{ formatTick(tick, span) }}</span>
          </div>
        </div>

        <template v-for="row in rows" :key="row.key">
          <button
            class="flex h-8 min-w-0 items-center gap-2 border-r pr-2 text-left text-[13px] transition-colors"
            :class="selectedKey === row.key ? 'bg-muted shadow-[inset_3px_0_0_var(--color-foreground)]' : 'hover:bg-muted/60'"
            :style="{ paddingLeft: `${12 + row.depth * 16}px` }"
            data-testid="run-waterfall-row"
            :data-step="row.key"
            @click="select(row.key)"
          >
            <span
              v-if="row.hasChildren"
              role="button"
              class="-ml-1 grid text-muted-foreground hover:text-foreground"
              :aria-expanded="!collapsed.has(row.key)"
              :title="collapsed.has(row.key) ? t('runDetail.expandAll') : t('runDetail.collapseAll')"
              @click.stop="toggleChildren(row.key)"
            >
              <ChevronRight class="size-3.5 transition-transform" :class="collapsed.has(row.key) ? '' : 'rotate-90'" />
            </span>
            <RunStepDot :action="row.action" small />
            <span class="truncate font-medium">
              <span v-if="row.action.group" class="font-normal text-muted-foreground">{{ row.action.group }}.</span>{{ row.action.name }}
            </span>
          </button>
          <div
            class="relative h-8 cursor-pointer"
            :class="selectedKey === row.key ? 'bg-muted' : 'hover:bg-muted/60'"
            @click="select(row.key)"
          >
            <div class="absolute inset-y-0 left-0 right-14">
              <span
                v-for="tick in ticks.slice(1)"
                :key="tick"
                class="absolute inset-y-0 border-l border-dashed"
                :style="{ left: `${(tick / span) * 100}%` }"
              />
              <span
                v-for="(bar, i) in bars(row.action)"
                :key="i"
                class="absolute min-w-[2px] rounded-[3px]"
                :class="[bar.cls, bar.thin ? 'top-[11px] h-2.5' : 'top-[9px] h-3.5']"
                :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
                :title="bar.title"
              />
              <span
                v-if="barLabel(row.action)"
                class="absolute top-[7px] whitespace-nowrap text-[11.5px] tabular-nums text-muted-foreground"
                :style="barLabel(row.action)!.style"
              >{{ barLabel(row.action)!.text }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="flex h-[220px] shrink-0 flex-col rounded-md border">
      <div v-if="selected" class="flex items-center gap-2 border-b px-3 py-2">
        <RunStepDot :action="selected.action" small />
        <span class="text-[13px] font-semibold">
          <span v-if="selected.action.group" class="font-normal text-muted-foreground">{{ selected.action.group }}.</span>{{ selected.action.name }}
        </span>
        <span v-if="selectedSpan" class="ml-auto text-xs tabular-nums text-muted-foreground">
          {{ t('runDetail.startedTook', { time: formatClock(selectedSpan.start, true), duration: formatStepDuration(selectedSpan.end - selectedSpan.start) }) }}
        </span>
      </div>
      <div class="flex-1 overflow-y-auto p-3">
        <RunStepDetail v-if="selected" :action="selected.action" :ended="ended" />
        <p v-else class="text-sm text-muted-foreground">{{ t('runDetail.selectHint') }}</p>
      </div>
    </div>
  </div>
</template>

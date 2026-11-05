<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CheckCircle2Icon, XCircleIcon, PauseCircleIcon, BanIcon } from 'lucide-vue-next';
import type { RunResult } from '@tipeline/agent';

/**
 * The exact half of a result message: run status, a link to the pipeline, and
 * every output (by its label when it has one), drawn from the real values (the model's sentence above it
 * may be short or wrong; these never are).
 */
const props = defineProps<{ result: RunResult; workflowName: string; workflowIdentifier: string }>();

const { t } = useI18n();
const router = useRouter();

const TABLE_ROWS = 3;
const TABLE_COLUMNS = 3;
const LIST_ITEMS = 5;
const LONG_TEXT = 160;

const STATUS = {
  completed: { icon: CheckCircle2Icon, class: 'text-emerald-600 dark:text-emerald-400' },
  failed: { icon: XCircleIcon, class: 'text-red-600 dark:text-red-400' },
  paused: { icon: PauseCircleIcon, class: 'text-amber-600 dark:text-amber-400' },
  canceled: { icon: BanIcon, class: 'text-muted-foreground' },
} as const;

const status = computed(() => STATUS[props.result.status] ?? STATUS.failed);
const seconds = computed(() => (props.result.durationMs / 1000).toFixed(1));

type OutputView =
  | { kind: 'empty' }
  | { kind: 'value'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[]; more: number }
  | { kind: 'table'; columns: string[]; rows: string[][]; more: number }
  | { kind: 'json'; text: string; size: number };

function plain(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function view(value: unknown): OutputView {
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  if (typeof value === 'string') return value.length > LONG_TEXT ? { kind: 'text', text: value } : { kind: 'value', text: value };
  if (typeof value !== 'object') return { kind: 'value', text: plain(value) };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'empty' };
    if (value.every(isRecord)) {
      const columns = Object.keys(value[0]).slice(0, TABLE_COLUMNS);
      const rows = value.slice(0, TABLE_ROWS).map((row) => columns.map((col) => plain(row[col])));
      return { kind: 'table', columns, rows, more: value.length - rows.length };
    }
    const items = value.slice(0, LIST_ITEMS).map(plain);
    return { kind: 'list', items, more: value.length - items.length };
  }
  return { kind: 'json', text: JSON.stringify(value, null, 2), size: Object.keys(value).length };
}

// An output's label stands in for its name, and its description shows on hover.
const outputs = computed(() =>
  Object.entries(props.result.outputs ?? {}).map(([name, value]) => {
    const detail = props.result.outputDetails?.[name];
    return {
      name,
      label: detail?.label,
      hint: [detail?.label ? name : '', detail?.description ?? ''].filter(Boolean).join(' · ') || name,
      view: view(value),
    };
  })
);

const expanded = ref(new Set<string>());
function toggle(name: string) {
  const next = new Set(expanded.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expanded.value = next;
}

function openRun() {
  if (!props.result.pipelineIdentifier) return;
  router.push(`/tasks/${props.workflowIdentifier}/pipelines/${props.result.pipelineIdentifier}`);
}
</script>

<template>
  <div class="rounded-md border overflow-hidden text-sm">
    <div class="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/50 border-b">
      <component :is="status.icon" class="w-4 h-4 shrink-0" :class="status.class" />
      <span class="font-medium truncate">{{ workflowName }}</span>
      <span class="text-xs text-muted-foreground tabular-nums">
        {{ t(`agent.result.${result.status}`) }} · {{ seconds }} s
      </span>
      <button
        v-if="result.pipelineIdentifier"
        class="ml-auto text-xs text-primary hover:underline whitespace-nowrap"
        @click="openRun"
      >
        {{ t('agent.result.openRun') }}
      </button>
    </div>

    <p v-if="result.error" class="px-3 py-2 text-xs text-red-600 dark:text-red-400 border-b whitespace-pre-wrap">
      {{ result.error }}
    </p>

    <p v-if="outputs.length === 0" class="px-3 py-2 text-xs text-muted-foreground">
      {{ t('agent.result.noOutputs') }}
    </p>

    <div v-for="output in outputs" :key="output.name" class="grid grid-cols-[88px_minmax(0,1fr)] gap-2 px-3 py-1.5 border-t first:border-t-0">
      <span
        class="text-xs text-muted-foreground truncate pt-0.5"
        :class="output.label ? '' : 'font-mono'"
        :title="output.hint"
      >{{ output.label ?? output.name }}</span>

      <span v-if="output.view.kind === 'empty'" class="text-muted-foreground">—</span>

      <span v-else-if="output.view.kind === 'value'" class="tabular-nums break-words select-text">{{ output.view.text }}</span>

      <div v-else-if="output.view.kind === 'text'" class="min-w-0">
        <p class="whitespace-pre-wrap break-words select-text" :class="expanded.has(output.name) ? '' : 'line-clamp-3'">
          {{ output.view.text }}
        </p>
        <button class="text-xs text-primary hover:underline" @click="toggle(output.name)">
          {{ expanded.has(output.name) ? t('agent.result.showLess') : t('agent.result.showMore') }}
        </button>
      </div>

      <span v-else-if="output.view.kind === 'list'" class="break-words select-text">
        {{ output.view.items.join(', ') }}
        <span v-if="output.view.more > 0" class="text-muted-foreground">
          {{ t('agent.result.moreItems', { count: output.view.more }) }}
        </span>
      </span>

      <div v-else-if="output.view.kind === 'table'" class="min-w-0 overflow-x-auto">
        <table class="w-full text-xs tabular-nums">
          <thead>
            <tr class="text-muted-foreground">
              <th v-for="col in output.view.columns" :key="col" class="text-left font-normal pb-0.5 pr-2">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in output.view.rows" :key="i" class="border-t">
              <td v-for="(cell, j) in row" :key="j" class="py-0.5 pr-2 truncate max-w-[140px]" :title="cell">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
        <button
          v-if="output.view.more > 0"
          class="text-xs text-primary hover:underline"
          :disabled="!result.pipelineIdentifier"
          @click="openRun"
        >
          {{ t('agent.result.moreRows', { count: output.view.more }) }}
        </button>
      </div>

      <div v-else-if="output.view.kind === 'json'" class="min-w-0">
        <button class="text-xs text-primary hover:underline" @click="toggle(output.name)">
          {{ t('agent.result.fields', { count: output.view.size }) }}
        </button>
        <pre
          v-if="expanded.has(output.name)"
          class="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[11px] select-text"
        >{{ output.view.text }}</pre>
      </div>
    </div>
  </div>
</template>

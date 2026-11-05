<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Copy, CheckCheck, ChevronDown, ChevronUp } from 'lucide-vue-next';
import type { StreamEvent } from '@/store/stream';
import { safeStringify, formatValue, truncateText, exceedsDisplayThreshold } from '@/utils/truncateValue';

const { t } = useI18n();

const props = defineProps<{
  events: StreamEvent[];
}>();

// The picked step's details (the default slot), or the raw event log.
const tab = defineModel<'step' | 'log'>('tab', { default: 'log' });
const tabs = ['step', 'log'] as const;

const parentPipelineId = computed(
  () => props.events.find((e) => e.type === 'start')?.pipelineIdentifier ?? ''
);

const logEntries = computed(() =>
  props.events.map((event) => {
    let label = '';
    let detail = '';
    let status: 'info' | 'success' | 'error' | 'neutral' = 'neutral';
    const isSubtask =
      !!parentPipelineId.value &&
      !!event.pipelineIdentifier &&
      event.pipelineIdentifier !== parentPipelineId.value;

    if (event.type === 'start') {
      label = isSubtask ? 'Subtask started' : 'Execution started';
      status = 'info';
    } else if (event.type === 'action') {
      label = event.data?.name ?? 'action';
      // Served from the result cache: the step didn't run.
      if (event.data?.cached) label += ` (${t('cache.cachedBadge').toLowerCase()})`;
      const parts: string[] = [];
      const params = event.data?.params;
      if (params !== null && params !== undefined && Object.keys(params).length > 0) {
        parts.push(`params: ${safeStringify(params)}`);
      }
      const raw = event.data?.result;
      if (raw !== null && raw !== undefined) {
        parts.push(`result: ${formatValue(raw)}`);
      }
      detail = parts.join('\n');
      status = 'success';
    } else if (event.type === 'end') {
      label = isSubtask ? 'Subtask finished' : 'Execution finished';
      status = 'success';
    } else if (event.type === 'error') {
      label = 'Error';
      detail = typeof event.error === 'string' ? event.error : (event.error?.message ?? '');
      status = 'error';
    } else if (event.type === 'action_error') {
      label = `Action error: ${event.data?.name ?? ''}`;
      detail = event.data?.error ?? '';
      status = 'error';
    } else {
      label = event.type;
    }

    return {
      label,
      detail,
      status,
      isSubtask,
      time: new Date(event.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  })
);

const logRef = ref<HTMLElement | null>(null);
const copiedEntries = ref<Record<number, boolean>>({});
const expandedEntries = ref<Record<number, boolean>>({});

const DETAIL_MAX_LENGTH = 300;
const DETAIL_MAX_LINES = 3;

async function copyDetail(index: number, detail: string) {
  await navigator.clipboard.writeText(detail);
  copiedEntries.value[index] = true;
  setTimeout(() => {
    copiedEntries.value[index] = false;
  }, 1500);
}

function toggleEntry(index: number) {
  expandedEntries.value[index] = !expandedEntries.value[index];
}

function isEntryExpanded(index: number): boolean {
  return !!expandedEntries.value[index];
}

function displayDetail(index: number, detail: string): string {
  return isEntryExpanded(index) ? detail : truncateText(detail, DETAIL_MAX_LENGTH);
}

function detailNeedsExpand(detail: string): boolean {
  return exceedsDisplayThreshold(detail, DETAIL_MAX_LENGTH, DETAIL_MAX_LINES);
}

watch(
  () => props.events.length,
  () => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight;
    }
  }
);
</script>

<template>
  <div class="flex flex-col h-full bg-background border-t border-border">
    <div class="flex items-center gap-3 px-3 pt-2 pb-1 shrink-0">
      <div class="inline-flex rounded-md border p-0.5 text-xs" role="tablist">
        <button
          v-for="name in tabs"
          :key="name"
          role="tab"
          class="rounded px-2.5 py-1 font-medium transition-colors"
          :class="tab === name ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="tab === name"
          :data-tab="name"
          @click="tab = name"
        >
          {{ t(`debugFooter.${name}`) }}
        </button>
      </div>
    </div>

    <div v-if="tab === 'step'" class="flex-1 min-h-0 pt-1">
      <slot />
    </div>

    <!-- Raw event log -->
    <div v-show="tab === 'log'" class="flex flex-col min-w-0 flex-1 min-h-0">
      <div ref="logRef" class="overflow-y-auto flex-1 min-h-0 text-xs font-mono space-y-0.5 px-3 py-2">
        <div
          v-for="(entry, i) in logEntries"
          :key="i"
          class="flex items-start gap-2 py-0.5 px-1 rounded"
          :class="{
            'pl-4': entry.isSubtask,
            'text-muted-foreground': entry.status === 'neutral' || entry.status === 'info',
            'text-emerald-600 dark:text-emerald-400': entry.status === 'success' && !entry.isSubtask,
            'text-violet-600 dark:text-violet-400': entry.status === 'success' && entry.isSubtask,
            'text-red-500 dark:text-red-400': entry.status === 'error',
          }"
        >
          <span class="text-muted-foreground shrink-0 w-20">{{ entry.time }}</span>
          <span
            class="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
            :class="{
              'bg-sky-500': entry.status === 'info' && !entry.isSubtask,
              'bg-violet-400': entry.status === 'info' && entry.isSubtask,
              'bg-emerald-500': entry.status === 'success' && !entry.isSubtask,
              'bg-violet-500': entry.status === 'success' && entry.isSubtask,
              'bg-red-500': entry.status === 'error',
              'bg-gray-400': entry.status === 'neutral',
            }"
          />
          <span class="flex-1 break-all min-w-0">
            <span
              v-if="entry.isSubtask"
              class="text-violet-400 dark:text-violet-500 mr-1 font-medium"
            >[subtask]</span>
            {{ entry.label }}
            <span v-if="entry.detail" class="text-muted-foreground ml-1 whitespace-pre-wrap">— {{ displayDetail(i, entry.detail) }}</span>
            <button
              v-if="entry.detail && detailNeedsExpand(entry.detail)"
              class="flex items-center gap-0.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline-offset-2 hover:underline mt-0.5"
              @click="toggleEntry(i)"
            >
              <ChevronUp v-if="isEntryExpanded(i)" class="size-3" />
              <ChevronDown v-else class="size-3" />
              {{ isEntryExpanded(i) ? t('debugFooter.showLess') : t('debugFooter.showMore') }}
            </button>
          </span>
          <button
            v-if="entry.detail"
            class="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-1"
            @click="copyDetail(i, entry.detail)"
          >
            <CheckCheck v-if="copiedEntries[i]" class="size-3 text-emerald-500" />
            <Copy v-else class="size-3" />
          </button>
        </div>
        <div v-if="logEntries.length === 0" class="text-muted-foreground text-center py-4">
          {{ t('debugFooter.emptyLog') }}
        </div>
      </div>
    </div>
  </div>
</template>

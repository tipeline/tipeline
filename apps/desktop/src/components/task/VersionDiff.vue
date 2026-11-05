<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { lineDiff, countChanges, type DiffLine } from '@/utils/lineDiff';
import { cn } from '@/lib/utils';

const props = defineProps<{ before: string; after: string }>();

const { t } = useI18n();

// Folded runs the user opened, by their position in the diff.
const opened = ref(new Set<number>());
const diff = computed(() => lineDiff(props.before, props.after));
watch(diff, () => (opened.value = new Set()));

const counts = computed(() => countChanges(diff.value));

type Row = Extract<DiffLine, { kind: 'same' | 'added' | 'removed' }> | { kind: 'skip'; count: number; index: number };

const rows = computed<Row[]>(() =>
  diff.value.flatMap((line, index): Row[] => {
    if (line.kind !== 'skip') return [line];
    return opened.value.has(index) ? (line.lines as Row[]) : [{ kind: 'skip', count: line.count, index }];
  })
);

function open(index: number) {
  opened.value = new Set([...opened.value, index]);
}

const ROW_CLASS = {
  same: '',
  added: 'bg-emerald-500/10',
  removed: 'bg-red-500/10',
};
const SIGN = { same: ' ', added: '+', removed: '−' };
</script>

<template>
  <div class="flex flex-col min-h-0 h-full">
    <div class="flex items-center gap-3 px-4 py-2 text-xs border-b shrink-0">
      <span v-if="!counts.added && !counts.removed" class="text-muted-foreground">{{ t('tasks.versions.diff.same') }}</span>
      <template v-else>
        <span class="text-emerald-600 dark:text-emerald-400 tabular-nums">+{{ counts.added }}</span>
        <span class="text-red-600 dark:text-red-400 tabular-nums">−{{ counts.removed }}</span>
        <span class="text-muted-foreground">{{ t('tasks.versions.diff.lines') }}</span>
      </template>
    </div>
    <div class="scroll-fade flex-1 min-h-0 overflow-auto font-mono text-xs leading-5">
      <table class="w-full border-collapse">
        <tbody>
          <template v-for="(row, i) in rows" :key="i">
            <tr v-if="row.kind === 'skip'">
              <td colspan="4" class="p-0">
                <button
                  type="button"
                  class="w-full text-left px-4 py-0.5 bg-muted/60 text-muted-foreground hover:bg-muted cursor-pointer"
                  @click="open(row.index)"
                >
                  ⋯ {{ t('tasks.versions.diff.unchanged', row.count) }}
                </button>
              </td>
            </tr>
            <tr v-else :class="ROW_CLASS[row.kind]">
              <td class="w-10 pr-2 text-right text-muted-foreground/70 select-none align-top tabular-nums">{{ row.oldNo ?? '' }}</td>
              <td class="w-10 pr-2 text-right text-muted-foreground/70 select-none align-top tabular-nums">{{ row.newNo ?? '' }}</td>
              <td
                :class="
                  cn(
                    'w-4 select-none align-top',
                    row.kind === 'added' && 'text-emerald-600 dark:text-emerald-400',
                    row.kind === 'removed' && 'text-red-600 dark:text-red-400'
                  )
                "
              >
                {{ SIGN[row.kind] }}
              </td>
              <td class="pr-4 whitespace-pre-wrap break-all">{{ row.text }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

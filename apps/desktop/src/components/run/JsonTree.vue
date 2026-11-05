<script setup lang="ts">
// A value as a collapsible tree, for the debugger's step output and variables. Nodes
// start open down to `expandDepth` levels; the ones a user opens or closes stay that
// way while the value keeps its shape. (The app's JSON component draws the same rows,
// with a toolbar around them.)
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight } from 'lucide-vue-next';
import { JSON_PAGE, containerPaths, jsonRows, parseJsonish, type JsonRow } from '@/utils/jsonTree';

const props = withDefaults(defineProps<{ value: unknown; expandDepth?: number }>(), { expandDepth: 1 });
const { t } = useI18n();

const data = computed(() => parseJsonish(props.value));
const open = ref(new Set<string>());
const shown = ref<Record<string, number>>({});
const touched = ref(false);

watch(
  () => JSON.stringify(data.value ?? null),
  () => {
    if (!touched.value) open.value = containerPaths(data.value, props.expandDepth);
    else {
      const still = containerPaths(data.value);
      open.value = new Set([...open.value].filter((path) => still.has(path)));
    }
  },
  { immediate: true }
);

const rows = computed(() => jsonRows(data.value, open.value, shown.value));

function toggle(row: JsonRow) {
  if (!row.size) return;
  const next = new Set(open.value);
  next.has(row.path) ? next.delete(row.path) : next.add(row.path);
  open.value = next;
  touched.value = true;
}
const showMore = (row: JsonRow) =>
  (shown.value = { ...shown.value, [row.path]: (shown.value[row.path] ?? JSON_PAGE) + JSON_PAGE });

const summary = (row: JsonRow) =>
  row.kind === 'array'
    ? t('apps.json.items', { count: row.size ?? 0 }, row.size ?? 0)
    : t('apps.json.keys', { count: row.size ?? 0 }, row.size ?? 0);
const leafText = (row: JsonRow) =>
  row.kind === 'string' ? JSON.stringify(row.value) : row.value === undefined ? 'null' : String(row.value);
const LEAF: Record<string, string> = {
  string: 'text-emerald-700 dark:text-emerald-400',
  number: 'text-blue-700 dark:text-blue-400',
  boolean: 'text-violet-700 dark:text-violet-400',
  null: 'text-muted-foreground italic',
};
</script>

<template>
  <div class="font-mono text-xs leading-5" role="tree" data-testid="json-tree">
    <template v-for="(row, i) in rows" :key="i">
      <div v-if="!row.closing" class="flex items-start gap-1 rounded hover:bg-muted/50" :style="{ paddingLeft: `${row.depth * 14}px` }">
        <button
          v-if="row.more"
          type="button"
          class="ml-4 text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
          @click="showMore(row)"
        >
          {{ t('apps.json.more', { count: row.more }, row.more) }}
        </button>
        <template v-else>
          <button
            v-if="row.size"
            type="button"
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            :aria-label="row.open ? t('apps.json.collapse') : t('apps.json.expand')"
            :aria-expanded="row.open"
            @click="toggle(row)"
          >
            <ChevronRight class="size-3.5 transition-transform" :class="row.open ? 'rotate-90' : ''" />
          </button>
          <span v-else class="size-4 shrink-0" />
          <span class="min-w-0 break-all" :class="row.size ? 'cursor-pointer' : ''" @click="toggle(row)">
            <template v-if="row.key !== null">
              <span :class="typeof row.key === 'number' ? 'text-muted-foreground' : 'text-rose-700 dark:text-rose-400'">{{ row.key }}</span>
              <span class="text-muted-foreground">: </span>
            </template>
            <span v-if="row.kind === 'object' || row.kind === 'array'" class="text-muted-foreground">
              {{ row.kind === 'array' ? '[' : '{' }}<span class="px-1 italic">{{ summary(row) }}</span>{{ row.kind === 'array' ? ']' : '}' }}
            </span>
            <span v-else :class="LEAF[row.kind]">{{ leafText(row) }}</span>
          </span>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronRight, Copy, FoldVertical, UnfoldVertical } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import {
  JSON_PAGE,
  containerPaths,
  jsonRows,
  parseJsonish,
  type JsonRow,
} from '@/utils/jsonTree';
import AppSkeleton from './AppSkeleton.vue';

// Any value — usually a workflow output — as a collapsible tree. A string holding JSON
// is parsed first. Nodes start open down to `expandDepth` levels (the ones a user opens stay
// open when `data` changes); a toolbar expands / collapses all, switches to the raw text and
// copies it. Each row copies its own value, and shows its path on hover.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t } = useI18n();

const value = computed(() => parseJsonish(props.props.data));
const empty = computed(() => value.value === undefined || value.value === null || value.value === '');
const depth = computed(() => {
  const n = Number(props.props.expandDepth ?? 1);
  return Number.isFinite(n) && n >= 0 ? n : 1;
});

const open = ref(new Set<string>());
const shown = ref<Record<string, number>>({});
const raw = ref(false);

// New data (a workflow ran again) opens down to expandDepth — until the user opens or
// closes something; from then on the nodes they opened that still exist stay open.
const touched = ref(false);
watch(
  [() => JSON.stringify(value.value ?? null), depth],
  ([, nextDepth], previous) => {
    if (previous && previous[1] !== nextDepth) touched.value = false;
    if (!touched.value) open.value = containerPaths(value.value, nextDepth);
    else {
      const still = containerPaths(value.value);
      open.value = new Set([...open.value].filter((path) => still.has(path)));
    }
    shown.value = {};
  },
  { immediate: true }
);

const rows = computed(() => jsonRows(value.value, open.value, shown.value));
const text = computed(() =>
  typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2) ?? ''
);

function toggle(row: JsonRow) {
  if (!row.size) return;
  const next = new Set(open.value);
  if (next.has(row.path)) next.delete(row.path);
  else next.add(row.path);
  open.value = next;
  touched.value = true;
}
function expandAll() {
  open.value = containerPaths(value.value);
  touched.value = true;
}
function collapseAll() {
  open.value = new Set();
  touched.value = true;
}
const showMore = (row: JsonRow) =>
  (shown.value = { ...shown.value, [row.path]: (shown.value[row.path] ?? JSON_PAGE) + JSON_PAGE });

const copied = ref<string | null>(null);
async function copy(id: string, v: unknown) {
  await navigator.clipboard.writeText(typeof v === 'string' ? v : (JSON.stringify(v, null, 2) ?? ''));
  copied.value = id;
  setTimeout(() => {
    if (copied.value === id) copied.value = null;
  }, 1500);
}

const keyText = (row: JsonRow) => (typeof row.key === 'number' ? String(row.key) : JSON.stringify(row.key));
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

// The builder shows what `data` is bound to.
const bindingText = computed(() => (typeof props.props.data === 'string' ? props.props.data : ''));
const toolButton =
  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50';
</script>

<template>
  <div class="h-full flex flex-col min-h-0 p-(--app-pad) gap-2">
    <div class="flex items-center gap-1 shrink-0 min-h-6">
      <p v-if="props.props.title" class="text-sm font-semibold m-0 truncate mr-auto">
        {{ props.props.title }}
      </p>
      <span v-else class="mr-auto" />
      <template v-if="!editable && !empty">
        <template v-if="!raw">
          <button type="button" :class="toolButton" :title="t('apps.json.expandAll')" @click="expandAll">
            <UnfoldVertical class="size-3.5" />
          </button>
          <button type="button" :class="toolButton" :title="t('apps.json.collapseAll')" @click="collapseAll">
            <FoldVertical class="size-3.5" />
          </button>
        </template>
        <button type="button" :class="toolButton" :aria-pressed="raw" @click="raw = !raw">
          {{ raw ? t('apps.json.tree') : t('apps.json.raw') }}
        </button>
        <button type="button" :class="toolButton" :title="t('apps.json.copyAll')" @click="copy('*', value)">
          <component :is="copied === '*' ? Check : Copy" class="size-3.5" />
        </button>
      </template>
    </div>

    <p v-if="editable" class="text-xs font-mono text-muted-foreground m-0 truncate" :title="bindingText">
      {{ bindingText || t('apps.details.noData') }}
    </p>

    <AppSkeleton v-else-if="empty && busy" variant="details" class="flex-1" />
    <div
      v-else-if="empty"
      class="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center"
    >
      {{ props.props.emptyText || t('apps.details.noData') }}
    </div>

    <pre
      v-else-if="raw"
      class="m-0 flex-1 min-h-0 overflow-auto text-xs font-mono whitespace-pre-wrap break-words bg-muted/40 rounded p-2"
      data-testid="json-raw"
    >{{ text }}</pre>

    <div v-else class="flex-1 min-h-0 overflow-auto scroll-fade font-mono text-xs leading-5" role="tree">
      <div
        v-for="(row, i) in rows"
        :key="i"
        class="group/json flex items-start gap-1 rounded hover:bg-muted/50 pr-1"
        :style="{ paddingLeft: `${row.depth * 14}px` }"
        :title="!row.closing && !row.more ? row.path || '(root)' : undefined"
        :role="row.closing || row.more ? undefined : 'treeitem'"
        :aria-expanded="row.size ? row.open : undefined"
        :data-path="row.closing || row.more ? undefined : row.path"
      >
        <!-- "show more" under a long array / object -->
        <button
          v-if="row.more"
          type="button"
          class="ml-4 text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          @click="showMore(row)"
        >
          {{ t('apps.json.more', { count: row.more }, row.more) }}
        </button>

        <span v-else-if="row.closing" class="ml-4 text-muted-foreground"
          >{{ row.kind === 'array' ? ']' : '}' }}{{ row.comma ? ',' : '' }}</span
        >

        <template v-else>
          <button
            v-if="row.size"
            type="button"
            class="size-4 mt-0.5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
            :aria-label="row.open ? t('apps.json.collapse') : t('apps.json.expand')"
            @click="toggle(row)"
          >
            <ChevronRight :class="cn('size-3.5 transition-transform', row.open && 'rotate-90')" />
          </button>
          <span v-else class="size-4 shrink-0" />
          <span class="min-w-0 break-all" :class="row.size ? 'cursor-pointer' : undefined" @click="toggle(row)">
            <template v-if="row.key !== null">
              <span :class="typeof row.key === 'number' ? 'text-muted-foreground' : 'text-rose-700 dark:text-rose-400'">{{
                keyText(row)
              }}</span
              ><span class="text-muted-foreground">: </span>
            </template>
            <template v-if="row.kind === 'object' || row.kind === 'array'">
              <span class="text-muted-foreground">{{ row.kind === 'array' ? '[' : '{' }}</span>
              <template v-if="!row.open">
                <span class="text-muted-foreground italic px-1">{{ summary(row) }}</span>
                <span class="text-muted-foreground">{{ row.kind === 'array' ? ']' : '}' }}{{ row.comma ? ',' : '' }}</span>
              </template>
            </template>
            <template v-else>
              <span :class="LEAF[row.kind]" class="whitespace-pre-wrap">{{ leafText(row) }}</span
              ><span class="text-muted-foreground">{{ row.comma ? ',' : '' }}</span>
            </template>
          </span>
          <button
            type="button"
            class="ml-auto shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover/json:opacity-100 focus-visible:opacity-100 transition-opacity"
            :title="t('apps.details.copy')"
            @click="copy(row.path, row.value)"
          >
            <component :is="copied === row.path ? Check : Copy" class="size-3" />
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

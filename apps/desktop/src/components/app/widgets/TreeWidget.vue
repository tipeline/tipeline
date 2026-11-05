<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronRight, Minus, Search } from 'lucide-vue-next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useIcon } from '@/composables/useIcon';
import {
  allNodes,
  buildTree,
  leavesOf,
  openToDepth,
  tickState,
  tickedSummary,
  toggleTick,
  visibleRows,
  type TreeNode,
} from '@/utils/appTreeView';
import AppSkeleton from './AppSkeleton.vue';

// Items in a hierarchy — folders, categories, departments — to choose from (the JSON
// viewer shows data; this one is for picking). Rows hold their `children`, or name their
// parent (`parentId`). A click selects a node (`itemClick`, `<id>.selectedNode` /
// `selectedId`); with `selection: multiple` each node has a tick box — a parent ticks all
// its leaves — and `change` fires with `<id>.checked` (ids of fully ticked nodes) and
// `checkedLeaves` (the ticked leaves' rows). `search` adds a box that keeps the matches
// and the nodes above them. Keyboard: arrows move and open / close, Enter selects,
// Space ticks.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t } = useI18n();
const { getIconComponent } = useIcon();

const SAMPLE = [
  { id: 'docs', label: 'Documents', icon: 'Folder', children: [
    { id: 'inv', label: 'Invoices', icon: 'Folder', children: [{ id: 'i1', label: 'March.pdf', icon: 'FileText' }, { id: 'i2', label: 'April.pdf', icon: 'FileText' }] },
    { id: 'con', label: 'Contracts', icon: 'Folder', children: [{ id: 'c1', label: 'Acme.pdf', icon: 'FileText' }] },
  ] },
  { id: 'img', label: 'Images', icon: 'Folder', children: [{ id: 'p1', label: 'logo.png', icon: 'Image' }] },
];
const sample = computed(() => props.editable && typeof props.props.data === 'string');

const nodes = computed(() =>
  buildTree(sample.value ? SAMPLE : props.props.data, {
    idKey: props.props.idKey,
    labelKey: props.props.labelKey,
    childrenKey: props.props.childrenKey,
    parentKey: props.props.parentKey,
    iconKey: sample.value ? 'icon' : props.props.iconKey,
    countKey: props.props.countKey,
  })
);
const multiple = computed(() => props.props.selection === 'multiple');

// Open nodes: as deep as `expandDepth` (default 1: the roots open) when the data comes.
const depth = computed(() => {
  const n = Number(props.props.expandDepth);
  return Number.isInteger(n) && n >= 0 ? n : 1;
});
const open = ref(new Set<string>());
watch(
  [nodes, depth],
  ([list], old) => {
    // New data keeps what was open (by id); the first data opens to the depth.
    const ids = new Set(allNodes(list).map((n) => n.id));
    open.value = old && open.value.size ? new Set([...open.value].filter((id) => ids.has(id))) : openToDepth(list, depth.value);
  },
  { immediate: true }
);
function toggle(node: TreeNode) {
  if (!node.children.length) return;
  const next = new Set(open.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  open.value = next;
}

const search = ref('');
const rows = computed(() => visibleRows(nodes.value, open.value, search.value));

// ---- selection
const selectedId = computed(() => (props.editable ? null : props.state?.selectedId ?? null));
function select(node: TreeNode) {
  if (props.editable) return;
  focused.value = node.id;
  emit('state', { selectedNode: node.row, selectedId: node.id });
  emit('event', 'itemClick', { selectedNode: node.row, selectedId: node.id });
}

// ---- ticking: leaf ids, from the ids the app holds (`checked` — a parent's id ticks its leaves)
const ticked = computed(() => {
  const ids = new Set<string>((props.state?.checked ?? []).map(String));
  return new Set(allNodes(nodes.value).filter((n) => ids.has(n.id)).flatMap((n) => leavesOf(n).map((l) => l.id)));
});
// Ticks given by id (defaultChecked, a reset) get their full summary once the data is here.
watch(
  [nodes, () => props.state?.checked],
  () => {
    if (props.editable || !multiple.value || !props.state?.checked?.length) return;
    const summary = tickedSummary(nodes.value, ticked.value);
    if (JSON.stringify(summary) !== JSON.stringify({ checked: props.state.checked, checkedLeaves: props.state.checkedLeaves ?? [] }))
      emit('state', summary);
  },
  { immediate: true }
);
function tick(node: TreeNode) {
  if (props.editable || !multiple.value) return;
  const summary = tickedSummary(nodes.value, toggleTick(node, ticked.value));
  emit('state', summary);
  emit('event', 'change', summary);
}

// ---- keyboard (roving focus over the rows that show)
const focused = ref<string | null>(null);
const list = ref<HTMLElement | null>(null);
const focusId = computed(() => (rows.value.some((r) => r.node.id === focused.value) ? focused.value : rows.value[0]?.node.id ?? null));
async function moveTo(id: string | undefined) {
  if (!id) return;
  focused.value = id;
  await nextTick();
  list.value?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.focus();
}
function onKey(e: KeyboardEvent, index: number) {
  const row = rows.value[index];
  if (!row) return;
  const { node } = row;
  const handled = () => e.preventDefault();
  switch (e.key) {
    case 'ArrowDown':
      handled();
      return moveTo(rows.value[index + 1]?.node.id);
    case 'ArrowUp':
      handled();
      return moveTo(rows.value[index - 1]?.node.id);
    case 'ArrowRight':
      handled();
      if (node.children.length && !row.open) return toggle(node);
      return moveTo(node.children[0]?.id);
    case 'ArrowLeft':
      handled();
      if (row.open) return toggle(node);
      return moveTo(node.parent?.id);
    case 'Enter':
      handled();
      return select(node);
    case ' ':
      handled();
      return multiple.value ? tick(node) : select(node);
  }
}
const ariaChecked = (node: TreeNode) => {
  const state = tickState(node, ticked.value);
  return state === 'indeterminate' ? 'mixed' : state;
};
const highlight = (label: string) => {
  const q = search.value.trim();
  const at = q ? label.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return at < 0 ? [label] : [label.slice(0, at), label.slice(at, at + q.length), label.slice(at + q.length)];
};
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="px-(--app-pad) pt-2.5 pb-1 text-sm font-medium truncate shrink-0">{{ props.props.title }}</div>
    <div v-if="props.props.search" class="relative px-(--app-pad-tight) pb-1.5 pt-1 shrink-0">
      <Search class="pointer-events-none absolute left-[calc(var(--app-pad-tight)+0.6rem)] top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <Input v-model="search" class="h-8 pl-8 text-sm" :placeholder="props.props.searchPlaceholder || t('apps.tree.search')" :disabled="editable" data-testid="tree-search" />
    </div>
    <AppSkeleton v-if="!rows.length && !search && busy && !editable" variant="list" class="flex-1" />
    <p v-else-if="!rows.length" class="m-auto p-4 text-xs text-muted-foreground">
      {{ search ? t('apps.tree.noMatch') : props.props.emptyText || t('apps.tree.empty') }}
    </p>
    <ul
      v-else
      ref="list"
      role="tree"
      :aria-multiselectable="multiple || undefined"
      :aria-label="props.props.title || componentId"
      class="flex-1 min-h-0 overflow-y-auto scroll-fade m-0 p-(--app-pad-tight) list-none"
      data-testid="tree"
    >
      <li
        v-for="(row, i) in rows"
        :key="row.node.id"
        role="treeitem"
        :aria-level="row.depth + 1"
        :aria-expanded="row.node.children.length ? row.open : undefined"
        :aria-selected="multiple ? undefined : row.node.id === selectedId"
        :aria-checked="multiple ? ariaChecked(row.node) : undefined"
        :tabindex="row.node.id === focusId ? 0 : -1"
        :data-node="row.node.id"
        :class="
          cn(
            'flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm outline-none cursor-default focus-visible:ring-[3px] focus-visible:ring-ring/50',
            row.node.id === selectedId ? 'bg-accent text-accent-foreground font-medium' : !editable && 'hover:bg-accent/50'
          )
        "
        :style="{ paddingLeft: `${row.depth * 1.1 + 0.25}rem` }"
        @click="select(row.node)"
        @keydown="onKey($event, i)"
      >
        <button
          type="button"
          tabindex="-1"
          :class="cn('size-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground', !row.node.children.length && 'invisible')"
          :aria-label="row.open ? t('apps.tree.collapse') : t('apps.tree.expand')"
          data-testid="tree-toggle"
          @click.stop="toggle(row.node)"
        >
          <ChevronRight :class="cn('size-3.5 transition-transform', row.open && 'rotate-90')" />
        </button>
        <Checkbox
          v-if="multiple"
          tabindex="-1"
          :model-value="tickState(row.node, ticked)"
          :disabled="editable"
          :aria-label="row.node.label"
          class="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary"
          @click.stop
          @update:model-value="tick(row.node)"
        >
          <Minus v-if="tickState(row.node, ticked) === 'indeterminate'" class="size-3.5" />
          <Check v-else class="size-3.5" />
        </Checkbox>
        <component :is="getIconComponent(row.node.icon)" v-if="row.node.icon && getIconComponent(row.node.icon)" class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate min-w-0" data-testid="tree-label">
          <template v-for="(part, p) in highlight(row.node.label)" :key="p">
            <mark v-if="p === 1" class="bg-amber-200/70 dark:bg-amber-500/40 text-inherit rounded-sm">{{ part }}</mark>
            <template v-else>{{ part }}</template>
          </template>
        </span>
        <span v-if="row.node.count" class="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{{ row.node.count }}</span>
      </li>
    </ul>
  </div>
</template>

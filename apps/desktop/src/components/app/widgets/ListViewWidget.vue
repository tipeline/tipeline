<script setup lang="ts">
import { computed, inject, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Repeat } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { APP_CANVAS } from '../appCanvasKey';
import { APP_LIST_SAMPLES, APP_RUNTIME } from '../appRuntimeKey';
import ListViewItem from './ListViewItem.vue';
import AppSkeleton from './AppSkeleton.vue';

// Repeats its children — one item's template — for every element of `data`. Inside,
// bindings use `item` (the element) and `index` (from 0). Clicking an item makes it
// `<id>.selectedItem` / `selectedIndex` and fires `itemClick`. The builder shows the
// template once, editable like a container.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t } = useI18n();

const canvas = inject(APP_CANVAS, null);

const items = computed<unknown[]>(() => (Array.isArray(props.props.data) ? props.props.data : []));
// What the template calls the element and its position (like a forEach loop's names).
const itemName = computed(() => (typeof props.props.itemName === 'string' && props.props.itemName) || 'item');
const indexName = computed(() => (typeof props.props.indexName === 'string' && props.props.indexName) || 'index');

const perRow = computed(() => {
  const n = Number(props.props.itemsPerRow);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1;
});

// In the builder's Preview, tell the builder what the items look like (their fields
// feed `item.` autocomplete).
const runtime = inject(APP_RUNTIME, null);
const reportSample = inject(APP_LIST_SAMPLES, null);
watch(
  items,
  (list) => {
    if (!props.editable && reportSample && runtime && list.length)
      reportSample(runtime.pageId(), props.componentId, list);
  },
  { immediate: true }
);

// The selected item is a copy of what was clicked; when the data reloads (e.g. after a
// card's button saved a change), take it again from the new data — by `itemKey` when
// set (dropped if it's gone), else by position — so whatever shows it stays current.
const keyOf = (item: unknown) => {
  const key = props.props.itemKey;
  return key && item && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined;
};
watch(
  () => JSON.stringify(items.value),
  () => {
    if (props.editable) return;
    const index = props.state?.selectedIndex;
    if (index === null || index === undefined) return;
    let next = -1;
    const key = keyOf(props.state?.selectedItem);
    if (props.props.itemKey && key !== undefined && key !== null)
      next = items.value.findIndex((item) => keyOf(item) === key);
    else if (!props.props.itemKey && index < items.value.length) next = index;
    const patch =
      next < 0
        ? { selectedItem: null, selectedIndex: null }
        : { selectedItem: items.value[next], selectedIndex: next };
    if (JSON.stringify(patch.selectedItem) !== JSON.stringify(props.state?.selectedItem) || patch.selectedIndex !== index)
      emit('state', patch);
  }
);

function select(item: unknown, index: number) {
  emit('event', 'itemClick', { selectedItem: item, selectedIndex: index });
}
</script>

<template>
  <!-- Builder: the item template -->
  <div v-if="editable" class="h-full flex flex-col min-h-0">
    <div class="flex items-center gap-1.5 px-(--app-pad-tight) py-1.5 border-b border-dashed text-xs text-muted-foreground shrink-0 min-w-0">
      <Repeat class="size-3.5 shrink-0" />
      <span class="truncate">
        {{ t('apps.listView.template') }} ·
        <!-- The names stay as written: they are what bindings use. -->
        <code class="font-mono text-foreground">{{ itemName }}</code> {{ t('apps.listView.itemHint') }},
        <code class="font-mono text-foreground">{{ indexName }}</code> {{ t('apps.listView.indexHint') }}
      </span>
    </div>
    <div class="flex-1 min-h-0 overflow-auto scroll-fade p-(--app-pad-tight)">
      <component :is="canvas.grid" v-if="canvas" :parent-id="componentId" />
    </div>
  </div>

  <AppSkeleton v-else-if="items.length === 0 && busy" variant="list" />
  <div
    v-else-if="items.length === 0"
    class="h-full flex items-center justify-center text-xs text-muted-foreground p-(--app-pad)"
  >
    {{ props.props.emptyText || t('apps.listView.empty') }}
  </div>

  <div v-else class="h-full overflow-auto scroll-fade p-(--app-pad-tight)">
    <!-- Items are list items, not buttons: their templates hold buttons of their own. -->
    <div role="list" class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }">
      <div
        v-for="(item, index) in items"
        :key="index"
        role="listitem"
        tabindex="0"
        data-list-item
        :aria-current="state?.selectedIndex === index || undefined"
        :class="
          cn(
            'rounded-lg p-0.5 cursor-pointer outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
            state?.selectedIndex === index && 'bg-primary/10 ring-2 ring-primary/40'
          )
        "
        @click="select(item, index)"
        @keydown.enter.self="select(item, index)"
      >
        <ListViewItem :list-id="componentId" :item="item" :index="index" :item-name="itemName" :index-name="indexName" />
      </div>
    </div>
  </div>
</template>

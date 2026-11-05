<script lang="ts">
// Shared by every grid on the canvas. Gridstack reports an item dragged from one
// editable grid into another to the grid it left as a removal (like a drop on the
// trash), right before the grid it entered reports the drop — so removals wait a
// microtask and skip the ids that moved.
const movedOut = new Set<string>();
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'gridstack/dist/gridstack.min.css';
import { GridStack } from 'gridstack';
import { GRID_MARGIN, fillLayouts } from './gridGeometry';
import type { GridItemHTMLElement, GridStackNode } from 'gridstack';
import { coreValidations } from '@tipeline/schemas';

// One renderer for both the builder (editable) and the runtime (static).
//
// Vue owns the DOM: items are rendered with v-for, so widgets are ordinary child
// components (full app context, reactivity, no manual mount/unmount). Gridstack only
// manages positions — new items are handed to it with makeWidget() after Vue renders
// them, and removed items are detached with removeWidget(el, removeDOM=false) before
// Vue removes them. Layout changes flow out as events; the parent updates its source
// and the props flow back in.

export interface GridLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

const props = defineProps<{
  /** `fill`: stretches to the bottom of the area around the grid (see fillLayouts). */
  items: Array<{ id: string; layout: GridLayout; fill?: boolean }>;
  editable?: boolean;
  selectedId?: string | null;
  /** A grid inside a container or tab (the palette is set up by the page's grid). */
  nested?: boolean;
  /** Items drawn without the card (no background, no border). */
  frameless?: (item: { id: string; layout: GridLayout }) => boolean;
}>();

const emit = defineEmits<{
  select: [id: string | null];
  'layout-change': [layouts: Array<{ id: string } & GridLayout>];
  /** A palette item was dropped (editable only); `type` comes from its data-component-type. */
  drop: [type: string, layout: GridLayout];
  /** An item was dropped on the trash zone (editable only). */
  remove: [id: string];
  /** An item of another grid was dropped on this one (editable only). */
  move: [id: string, layout: GridLayout];
}>();


const gridEl = ref<HTMLElement | null>(null);
const itemEls = new Map<string, GridItemHTMLElement>();
let grid: GridStack | null = null;

const ROW = coreValidations.appObject.APP_GRID_ROW_HEIGHT;

// Rows that fit the area around a running grid, less its padding and the grid's own
// margins (negative on the flush page grid). Only measured in an area whose height the
// layout sets (data-app-fill-area: the page, a drawer, a container or tab) — in a
// dialog the area grows with the grid, so filling it would be meaningless.
const fillRows = ref<number | null>(null);
let areaObserver: ResizeObserver | null = null;

function measureFill() {
  const area = gridEl.value?.parentElement;
  if (!gridEl.value || !area) return;
  const a = getComputedStyle(area);
  const g = getComputedStyle(gridEl.value);
  const height =
    area.clientHeight -
    parseFloat(a.paddingTop) -
    parseFloat(a.paddingBottom) -
    parseFloat(g.marginTop) -
    parseFloat(g.marginBottom);
  fillRows.value = Math.floor(height / ROW);
}

const placed = computed(() => fillLayouts(props.items, fillRows.value));

// In nested grids a click reaches every enclosing item too — only the innermost one
// is selected.
function onItemClick(event: MouseEvent, id: string) {
  if (!props.editable) return;
  event.stopPropagation();
  emit('select', id);
}

function setItemEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) itemEls.set(id, el as GridItemHTMLElement);
  else itemEls.delete(id);
}

// Palette items, and items of the other editable grids — except a container being
// dropped into a grid inside itself.
function accepts(el: Element): boolean {
  if (el.classList.contains('app-palette-item')) return true;
  const from = (el as GridItemHTMLElement).gridstackNode?.grid?.el;
  return (
    !!from?.classList.contains('app-grid--editable') &&
    !!gridEl.value &&
    !el.contains(gridEl.value)
  );
}

onMounted(() => {
  if (!gridEl.value) return;
  grid = GridStack.init(
    {
      column: 12,
      cellHeight: ROW,
      margin: GRID_MARGIN,
      float: true,
      // An empty builder page still offers a drop area (420px).
      minRow: props.editable && !props.nested ? 42 : 1,
      staticGrid: !props.editable,
      acceptWidgets: props.editable ? accepts : false,
      removable: props.editable ? '#app-builder-trash' : false,
      resizable: { handles: 'se,e,s,sw,w' },
    },
    gridEl.value
  );

  // Gridstack links a grid to the grid item around it (its own sub-grid feature) —
  // but only when that item is already a widget, i.e. for a container grid that
  // appears later (a tab opened, a hidden container shown). Vue owns the nesting
  // here, and Vue destroys the outer grid first, after which the linked inner grid
  // crashes when it reports its height to it. Unlink, so every grid is independent.
  if (grid.parentGridNode) {
    grid.parentGridNode.el?.classList.remove('grid-stack-sub-grid');
    delete grid.parentGridNode.subGrid;
    delete grid.parentGridNode;
    gridEl.value.classList.remove('grid-stack-nested');
  }

  if (!props.editable) {
    const area = gridEl.value.parentElement;
    if (area?.hasAttribute('data-app-fill-area')) {
      areaObserver = new ResizeObserver(measureFill);
      areaObserver.observe(area);
    }
    return;
  }

  if (!props.nested)
    GridStack.setupDragIn('.app-palette-item', {
      appendTo: 'body',
      helper: 'clone',
    });

  grid.on('change', (_e: Event, nodes: GridStackNode[]) => {
    emit(
      'layout-change',
      nodes
        // Only our own items — not one passing through from another grid.
        .filter((n) => n.id != null && props.items.some((i) => i.id === String(n.id)))
        .map((n) => ({
          id: String(n.id),
          x: n.x ?? 0,
          y: n.y ?? 0,
          w: n.w ?? 1,
          h: n.h ?? 1,
        }))
    );
  });

  grid.on('dropped', (_e: Event, prev: GridStackNode | undefined, node: GridStackNode) => {
    const el = node.el as HTMLElement | undefined;
    const layout = { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 };
    // An item from another grid: gridstack moved its element in here, but Vue rendered
    // it in the grid it came from and removes it from there once the parent moves the
    // component. Hand it back until then (it stays there if the move is refused).
    if (el && prev?.grid && prev.grid !== grid && prev.id != null) {
      const id = String(prev.id);
      movedOut.add(id);
      grid?.removeWidget(el, false, false);
      prev.grid.el.appendChild(el);
      prev.grid.makeWidget(el, { id: prev.id, x: prev.x, y: prev.y, w: prev.w, h: prev.h });
      emit('move', id, layout);
      return;
    }
    const type = el?.dataset.componentType;
    // The dropped element is gridstack's copy of the palette item — discard it; the
    // parent adds a component and Vue renders the real item at this position.
    if (el) grid?.removeWidget(el, true, false);
    if (type) emit('drop', type, layout);
  });

  // Trash drops, and items dragged into another grid (skipped, see movedOut): every
  // programmatic removal below passes triggerEvent=false.
  grid.on('removed', (_e: Event, nodes: GridStackNode[]) => {
    for (const node of nodes) {
      if (node.id == null) continue;
      const id = String(node.id);
      queueMicrotask(() => {
        if (!movedOut.delete(id)) emit('remove', id);
      });
    }
  });
});

// Before Vue patches the DOM: detach items that are going away from gridstack
// (the element is still in the document at this point).
watch(
  () => props.items.map((i) => i.id),
  (ids, previous) => {
    if (!grid) return;
    const keep = new Set(ids);
    for (const id of previous ?? []) {
      const el = itemEls.get(id);
      if (!keep.has(id) && el?.gridstackNode)
        grid.removeWidget(el, false, false);
    }
  },
  { flush: 'pre' }
);

// After Vue patched the DOM: register new items, and move/resize items whose
// layout changed from outside (e.g. an edit in the Properties panel).
watch(
  () => placed.value.map((i) => ({ id: i.id, ...i.layout })),
  async (items) => {
    await nextTick();
    if (!grid) return;
    grid.batchUpdate();
    for (const item of items) {
      const el = itemEls.get(item.id);
      if (!el) continue;
      if (!el.gridstackNode) {
        grid.makeWidget(el);
        continue;
      }
      const n = el.gridstackNode;
      if (
        n.x !== item.x ||
        n.y !== item.y ||
        n.w !== item.w ||
        n.h !== item.h
      ) {
        grid.update(el, { x: item.x, y: item.y, w: item.w, h: item.h });
      }
    }
    grid.batchUpdate(false);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  areaObserver?.disconnect();
  grid?.destroy(false);
  grid = null;
});
</script>

<template>
  <div
    ref="gridEl"
    class="grid-stack app-grid"
    :class="{
      'app-grid--editable': editable,
      'app-grid--nested': nested,
      'app-grid--flush': !editable && !nested,
    }"
    :style="{ '--app-grid-margin': `${GRID_MARGIN}px` }"
    @click.self="editable && emit('select', null)"
  >
    <div
      v-for="item in placed"
      :key="item.id"
      :ref="(el) => setItemEl(item.id, el)"
      class="grid-stack-item"
      :gs-id="item.id"
      :gs-x="item.layout.x"
      :gs-y="item.layout.y"
      :gs-w="item.layout.w"
      :gs-h="item.layout.h"
    >
      <div
        class="grid-stack-item-content"
        :class="{
          'is-selected': editable && selectedId === item.id,
          'is-frameless': frameless?.(item),
        }"
        @click="onItemClick($event, item.id)"
      >
        <slot :item="item" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-grid {
  min-height: 100%;
}

.app-grid--flush {
  margin: calc(-1 * var(--app-grid-margin));
}

/* Widgets pad their content with these (`p-(--app-pad)`), so every card breathes
   the same; tune them here. */
:deep(.grid-stack-item-content) {
  --app-pad: 1.25rem;
  --app-pad-tight: 0.625rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* A widget that is currently hidden (e.g. an alert with nothing to say) leaves an
   empty, borderless cell instead of a blank card. So does a frameless component. */
.app-grid:not(.app-grid--editable)
  :deep(.grid-stack-item-content:has(> .app-widget-hidden)),
.app-grid:not(.app-grid--editable) :deep(.grid-stack-item-content.is-frameless) {
  background: transparent;
  border-color: transparent;
}

/* In the builder a frameless component still needs an edge to find and grab: a faint
   dashed one, solid on hover. */
.app-grid--editable :deep(.grid-stack-item-content.is-frameless) {
  background: transparent;
  border-style: dashed;
  border-color: color-mix(in oklab, var(--border) 60%, transparent);
}
.app-grid--editable :deep(.grid-stack-item-content.is-frameless:hover) {
  border-color: var(--border);
}

.app-grid--editable :deep(.grid-stack-item-content) {
  cursor: move;
}

.app-grid--editable :deep(.grid-stack-item-content.is-selected) {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { coreValidations } from '@tipeline/schemas';
import { GRID_MARGIN } from './gridGeometry';

// The same 12-column grid as AppGrid, laid out with plain CSS — no gridstack, so it is
// cheap to repeat (a list view draws one per item). Read-only: nothing moves.
interface Layout {
  x: number;
  y: number;
  w: number;
  h: number;
}
const props = defineProps<{
  items: Array<{ id: string; layout: Layout }>;
  /** Items drawn without the card (no background, no border). */
  frameless?: (item: { id: string; layout: Layout }) => boolean;
}>();

const ROW = coreValidations.appObject.APP_GRID_ROW_HEIGHT;
const rows = computed(() => props.items.reduce((max, i) => Math.max(max, i.layout.y + i.layout.h), 0));

const cell = (l: Layout) => ({
  left: `${(l.x / 12) * 100}%`,
  width: `${(l.w / 12) * 100}%`,
  top: `${l.y * ROW}px`,
  height: `${l.h * ROW}px`,
  padding: `${GRID_MARGIN}px`,
});
</script>

<template>
  <div class="static-grid" :style="{ height: `${rows * ROW}px` }">
    <div v-for="item in items" :key="item.id" class="static-grid-cell" :style="cell(item.layout)">
      <div class="static-grid-content" :class="{ 'is-frameless': frameless?.(item) }">
        <slot :item="item" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.static-grid {
  position: relative;
}
.static-grid-cell {
  position: absolute;
  box-sizing: border-box;
}
/* Same card as AppGrid's .grid-stack-item-content. */
.static-grid-content {
  --app-pad: 1.25rem;
  --app-pad-tight: 0.625rem;
  height: 100%;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.static-grid-content:has(> .app-widget-hidden),
.static-grid-content.is-frameless {
  background: transparent;
  border-color: transparent;
}
</style>

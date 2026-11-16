<script setup lang="ts">
import { computed } from 'vue';
import {
  APP_PHONE_COLUMNS,
  coreValidations,
  isPhoneArranged,
  phoneLayouts,
  type PhoneLayoutItem,
} from '@tipeline/schemas';

const ROW_HEIGHT = coreValidations.appObject.APP_GRID_ROW_HEIGHT;

/**
 * Stands in for Desktop's page grid (AppGrid) in the phone build: the same props and slot,
 * laid out for a narrow screen by the rule the app builder's phone canvas uses
 * (phoneLayouts in @tipeline/schemas):
 *  - arranged in the builder: each component where it was placed on the phone grid;
 *  - otherwise in reading order, full width, small neighbours two to a row, each at least
 *    as tall as on Desktop.
 * Components hidden on phones aren't drawn.
 */
const props = defineProps<{
  items: PhoneLayoutItem[];
  nested?: boolean;
  frameless?: (item: PhoneLayoutItem) => boolean;
  // Desktop's builder props; never set on a phone.
  editable?: boolean;
  selectedId?: string | null;
  phone?: boolean;
  columns?: number;
}>();

const placements = computed(() => phoneLayouts(props.items));
const arranged = computed(() => isPhoneArranged(props.items));

function cellStyle(layout: { x: number; y: number; w: number; h: number }) {
  if (arranged.value) {
    return {
      gridColumn: `${layout.x + 1} / span ${layout.w}`,
      gridRow: `${layout.y + 1} / span ${layout.h}`,
    };
  }
  return { gridColumn: `span ${layout.w}`, minHeight: `${layout.h * ROW_HEIGHT}px` };
}
</script>

<template>
  <div
    class="phone-grid"
    :class="{ nested, arranged }"
    :style="{ '--phone-columns': APP_PHONE_COLUMNS, '--phone-row': `${ROW_HEIGHT}px` }"
  >
    <div
      v-for="cell in placements"
      :key="cell.item.id"
      class="phone-grid-cell"
      :class="{ half: cell.layout.w < APP_PHONE_COLUMNS }"
      :style="cellStyle(cell.layout)"
    >
      <div class="phone-grid-content" :class="{ 'is-frameless': frameless?.(cell.item) }">
        <slot :item="cell.item" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.phone-grid {
  display: grid;
  grid-template-columns: repeat(var(--phone-columns), minmax(0, 1fr));
  gap: 10px;
}
/* Placed in the builder: rows of Desktop's height; the gap is each cell's padding. */
.phone-grid.arranged {
  grid-auto-rows: var(--phone-row);
  gap: 0;
  margin: -5px;
}
.phone-grid.arranged .phone-grid-cell {
  padding: 5px;
  min-height: 0;
}
.phone-grid-cell {
  display: flex;
  min-width: 0;
}
/* The same card as Desktop's grids. */
.phone-grid-content {
  --app-pad: 1rem;
  --app-pad-tight: 0.625rem;
  flex: 1;
  min-width: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.phone-grid-content:has(> .app-widget-hidden),
.phone-grid-content.is-frameless {
  background: transparent;
  border-color: transparent;
}
</style>

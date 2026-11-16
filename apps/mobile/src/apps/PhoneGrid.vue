<script setup lang="ts">
import { computed } from 'vue';
import { phoneLayout, ROW_HEIGHT, type PhoneGridItem } from './phoneLayout';

/**
 * Stands in for Desktop's page grid (AppGrid) in the phone build: the same props and slot,
 * laid out for a narrow screen. See phoneLayout for the rules.
 */
const props = defineProps<{
  items: PhoneGridItem[];
  nested?: boolean;
  frameless?: (item: PhoneGridItem) => boolean;
  // Desktop's builder props; never set on a phone.
  editable?: boolean;
  selectedId?: string | null;
}>();

const cells = computed(() => phoneLayout(props.items));
</script>

<template>
  <div class="phone-grid" :class="{ nested }">
    <div
      v-for="cell in cells"
      :key="cell.item.id"
      class="phone-grid-cell"
      :class="{ half: cell.half }"
      :style="{ minHeight: `${cell.item.layout.h * ROW_HEIGHT}px` }"
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.phone-grid-cell {
  grid-column: span 2;
  display: flex;
}
.phone-grid-cell.half {
  grid-column: span 1;
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

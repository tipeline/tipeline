<script setup lang="ts">
import { computed } from 'vue';
import { cssColor, normalizeColor } from '@/utils/appColor';

// A value shown with `format: color` (table column, details, timeline, kanban): a small
// swatch and its hex. Text that isn't a color is shown as it is.
const props = defineProps<{ value: unknown }>();
const css = computed(() => cssColor(props.value));
const text = computed(() => normalizeColor(props.value, true) ?? (props.value == null ? '' : String(props.value)));
</script>

<template>
  <span class="inline-flex items-center gap-1.5 min-w-0 align-middle" data-testid="color-chip">
    <span
      v-if="css"
      class="size-3.5 shrink-0 rounded-[4px] border shadow-xs overflow-hidden"
      style="background: repeating-conic-gradient(#d4d4d8 0 25%, #fff 0 50%) 0 0 / 6px 6px"
    >
      <span class="block size-full" :style="{ backgroundColor: css }" data-testid="color-chip-swatch" />
    </span>
    <span class="font-mono text-[0.92em] truncate">{{ text }}</span>
  </span>
</template>

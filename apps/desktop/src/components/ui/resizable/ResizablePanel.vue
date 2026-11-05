<script setup lang="ts">
import { inject, onMounted, onBeforeUnmount, computed } from 'vue';
import { cn } from '@/lib/utils';
import { generateIdentifier } from '@tipeline/utils';

const props = defineProps<{
  defaultSize?: number;
  minSize?: number;
  class?: string;
}>();

const id = generateIdentifier();

const ctx = inject<any>('resizable');

onMounted(() => {
  ctx?.registerPanel(id, props.defaultSize ?? 50);
});

onBeforeUnmount(() => {
  ctx?.unregisterPanel(id);
});

const flexBasis = computed(() => {
  const size = ctx?.getPanelSize(id) ?? (props.defaultSize ?? 50);
  return `${size}%`;
});
</script>

<template>
  <div
    :style="{ flexBasis: flexBasis, flexGrow: 0, flexShrink: 1 }"
    :class="cn('min-h-0 min-w-0', props.class)"
  >
    <slot />
  </div>
</template>

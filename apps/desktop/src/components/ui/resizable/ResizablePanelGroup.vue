<script setup lang="ts">
import { provide, ref, onMounted } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  direction?: 'horizontal' | 'vertical';
  class?: string;
}>();

// Each panel registers here: { id, size (0-100) }
const panels = ref<Array<{ id: string; size: number }>>([]);
const groupRef = ref<HTMLElement | null>(null);

function registerPanel(id: string, defaultSize: number) {
  panels.value.push({ id, size: defaultSize });
}

function unregisterPanel(id: string) {
  const idx = panels.value.findIndex((p) => p.id === id);
  if (idx !== -1) panels.value.splice(idx, 1);
}

function getPanelSize(id: string): number {
  return panels.value.find((p) => p.id === id)?.size ?? 50;
}

function resizePanels(handleIndex: number, delta: number) {
  // handleIndex: index of the panel BEFORE the handle (0-based)
  const before = panels.value[handleIndex];
  const after = panels.value[handleIndex + 1];
  if (!before || !after) return;

  const MIN = 5;
  const clampedDelta = Math.max(MIN - before.size, Math.min(after.size - MIN, delta));
  before.size += clampedDelta;
  after.size -= clampedDelta;
}

provide('resizable', {
  direction: props.direction ?? 'horizontal',
  groupRef,
  panels,
  registerPanel,
  unregisterPanel,
  getPanelSize,
  resizePanels,
});
</script>

<template>
  <div
    ref="groupRef"
    :class="cn(
      'flex h-full w-full',
      (props.direction ?? 'horizontal') === 'vertical' ? 'flex-col' : 'flex-row',
      props.class
    )"
  >
    <slot />
  </div>
</template>

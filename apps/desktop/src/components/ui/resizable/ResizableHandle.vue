<script setup lang="ts">
import { inject, ref, computed, onBeforeUnmount } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  withHandle?: boolean;
  class?: string;
}>();

const ctx = inject<any>('resizable');
const direction = computed(() => ctx?.direction ?? 'horizontal');
const isVertical = computed(() => direction.value === 'vertical');

const isDragging = ref(false);
let lastPos = 0;

// Find which handle index this is (0-based: index among ResizableHandles)
let handleIndex = -1;

function getHandleIndex(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return 0;
  const handles = Array.from(parent.querySelectorAll('[data-resize-handle]'));
  return handles.indexOf(el);
}

function onMousedown(e: MouseEvent) {
  e.preventDefault();
  isDragging.value = true;
  lastPos = isVertical.value ? e.clientY : e.clientX;

  const el = e.currentTarget as HTMLElement;
  handleIndex = getHandleIndex(el);

  window.addEventListener('mousemove', onMousemove);
  window.addEventListener('mouseup', onMouseup);
}

function onMousemove(e: MouseEvent) {
  if (!isDragging.value || !ctx?.groupRef?.value) return;

  const currentPos = isVertical.value ? e.clientY : e.clientX;
  const delta = currentPos - lastPos;
  lastPos = currentPos;

  const groupRect = ctx.groupRef.value.getBoundingClientRect();
  const totalSize = isVertical.value ? groupRect.height : groupRect.width;
  if (totalSize === 0) return;

  const deltaPercent = (delta / totalSize) * 100;
  ctx.resizePanels(handleIndex, deltaPercent);
}

function onMouseup() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onMousemove);
  window.removeEventListener('mouseup', onMouseup);
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMousemove);
  window.removeEventListener('mouseup', onMouseup);
});
</script>

<template>
  <div
    data-resize-handle
    :class="cn(
      'relative flex flex-shrink-0 items-center justify-center bg-border transition-colors',
      'hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      isVertical ? 'h-px w-full cursor-row-resize py-1' : 'h-full w-px cursor-col-resize px-1',
      { 'bg-primary/20': isDragging },
      props.class
    )"
    @mousedown="onMousedown"
  >
    <div
      v-if="props.withHandle"
      :class="cn(
        'z-10 flex items-center justify-center rounded-sm border bg-border',
        isVertical ? 'h-4 w-8' : 'h-8 w-4'
      )"
    >
      <svg
        v-if="isVertical"
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="text-muted-foreground"
      >
        <path d="M8 6h10M8 12h10M8 18h10" />
      </svg>
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="text-muted-foreground"
      >
        <path d="M6 8v10M12 8v10M18 8v10" />
      </svg>
    </div>
  </div>
</template>

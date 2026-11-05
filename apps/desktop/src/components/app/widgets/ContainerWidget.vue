<script setup lang="ts">
import { computed, inject } from 'vue';
import { APP_CANVAS } from '../appCanvasKey';
import { isShown } from './visibility';

// A titled box with its own 12-column grid. Children name it in `parent`; hiding the
// container hides them too.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();

const canvas = inject(APP_CANVAS, null);
const visible = computed(() => isShown(props.props.visible, props.editable));
</script>

<template>
  <div v-if="visible" class="h-full flex flex-col min-h-0">
    <div
      v-if="props.props.title || props.props.description"
      class="px-(--app-pad) pt-2.5 pb-2 shrink-0 border-b"
    >
      <p v-if="props.props.title" class="text-sm font-semibold m-0 truncate">
        {{ props.props.title }}
      </p>
      <p
        v-if="props.props.description"
        class="text-xs text-muted-foreground m-0 truncate"
      >
        {{ props.props.description }}
      </p>
    </div>
    <div class="flex-1 min-h-0 overflow-auto p-(--app-pad-tight)" data-app-fill-area>
      <component :is="canvas.grid" v-if="canvas" :parent-id="componentId" />
    </div>
  </div>
  <!-- Hidden: tells the grid cell to drop its card chrome (see AppGrid). -->
  <div v-else class="app-widget-hidden" />
</template>

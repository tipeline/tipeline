<script setup lang="ts">
import { computed } from 'vue';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next';
import { isHidden } from './visibility';

// A message banner, e.g. bound to `{{ runnables.save.error }}`. A running app hides it
// (and closes its rows) while it has no title or message, or `visible` is false.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;
const STYLES = {
  info: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  success:
    'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
  warning:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
} as const;

const variant = computed<keyof typeof ICONS>(() =>
  props.props.variant in ICONS ? props.props.variant : 'info'
);
const visible = computed(() => props.editable || !isHidden('alert', props.props));
</script>

<template>
  <div v-if="visible" class="h-full px-(--app-pad) py-2">
    <div
      class="h-full flex gap-2 rounded-md border px-3 py-2 overflow-auto"
      :class="STYLES[variant]"
    >
      <component :is="ICONS[variant]" class="size-4 mt-0.5 shrink-0" />
      <div class="min-w-0">
        <p v-if="props.props.title" class="text-sm font-semibold m-0">
          {{ props.props.title }}
        </p>
        <p class="text-sm m-0 whitespace-pre-wrap">{{ props.props.message }}</p>
      </div>
    </div>
  </div>
  <!-- Hidden: tells the grid cell to drop its card chrome (see AppGrid). -->
  <div v-else class="app-widget-hidden" />
</template>

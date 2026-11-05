<script setup lang="ts">
import { computed } from 'vue';
import type { AppComponent } from '@tipeline/schemas';
import type { RunStatus } from '@/composables/useAppRuntime';
import { WIDGETS_BY_TYPE } from './widgets/registry';

// Renders one app component. The builder passes the raw props (bindings shown as
// written); the runtime passes props already resolved against the page context,
// plus the component's runtime state (an input's value, a table's selected row…).
const props = defineProps<{
  component: AppComponent;
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  editable?: boolean;
  busy?: boolean;
  /** The workflow run this component started, if any (forms show its progress). */
  run?: RunStatus | null;
}>();

const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
  reset: [];
}>();

const widget = computed(
  () => WIDGETS_BY_TYPE[props.component.type]?.component ?? null
);

// A thin bar across the top while a run it depends on is going — a reload of data it
// already shows (its first load draws a skeleton instead, inside the widget). Buttons
// and forms show their own spinner.
const OWN_SPINNER = new Set(['button', 'buttonGroup', 'form']);
// A KPI only looks clickable when its click does something.
const clickable = computed(
  () => props.component.type === 'kpi' && !!(props.component.events as Record<string, unknown[]> | undefined)?.click?.length
);
const loadingBar = computed(
  () =>
    !!props.busy && !props.editable && !OWN_SPINNER.has(props.component.type)
);
</script>

<template>
  <div v-if="widget" class="relative h-full">
    <component
      :is="widget"
      class="h-full"
      :props="props.props"
      :state="state"
      :component-id="component.id"
      :editable="editable"
      :busy="busy"
      :run="component.type === 'form' ? run : undefined"
      :clickable="component.type === 'kpi' ? clickable : undefined"
      @event="
        (name: string, payload?: Record<string, unknown>) =>
          emit('event', name, payload)
      "
      @state="(patch: Record<string, unknown>) => emit('state', patch)"
      @reset="emit('reset')"
    />
    <div
      v-if="loadingBar"
      class="app-loading-bar absolute inset-x-0 top-0 h-0.5 overflow-hidden pointer-events-none"
      role="progressbar"
      aria-busy="true"
      data-testid="app-loading-bar"
    >
      <div class="h-full w-1/3 bg-primary/70 rounded-full" />
    </div>
  </div>
  <div
    v-else
    class="flex items-center justify-center h-full text-xs text-muted-foreground p-2"
  >
    {{ component.type }}
  </div>
</template>

<style scoped>
.app-loading-bar > div {
  animation: app-loading-slide 1.1s ease-in-out infinite;
}
@keyframes app-loading-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-loading-bar > div {
    animation: none;
    width: 100%;
    opacity: 0.5;
  }
}
</style>

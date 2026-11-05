<script setup lang="ts" generic="T extends string">
// Compact segmented switch for the dashboard cards (Starred, Recent runs, Browse).
defineProps<{ options: { value: T; label: string }[]; label?: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div role="radiogroup" :aria-label="label" class="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="px-2 py-0.5 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="model === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

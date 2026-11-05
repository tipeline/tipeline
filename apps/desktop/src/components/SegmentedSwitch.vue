<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue';

// A list page's segmented switch at control height (h-9): the All / Starred / Recently opened
// scope with counts, or the view picker as icons (the label becomes the tooltip).
defineProps<{
  options: { value: T; label: string; count?: number; icon?: Component }[];
  label?: string;
}>();
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
      :title="option.icon ? option.label : undefined"
      :aria-label="option.icon ? option.label : undefined"
      class="inline-flex items-center justify-center gap-1.5 h-8 text-sm font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :class="[
        option.icon ? 'w-8' : 'px-3',
        model === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      ]"
      @click="model = option.value"
    >
      <component :is="option.icon" v-if="option.icon" class="size-4" />
      <template v-else>
        {{ option.label }}
        <span v-if="option.count !== undefined" class="text-xs tabular-nums text-muted-foreground">{{ option.count }}</span>
      </template>
    </button>
  </div>
</template>

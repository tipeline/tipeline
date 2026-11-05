<script setup lang="ts">
defineProps<{ title?: string; description?: string; bodyClass?: string }>();
</script>

<template>
  <div class="rounded-lg border bg-card text-card-foreground overflow-hidden">
    <div
      v-if="title || $slots.actions"
      class="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 border-b"
    >
      <div class="min-w-0">
        <h3 class="text-[14.5px] font-semibold">{{ title }}</h3>
        <p v-if="description" class="mt-0.5 text-[12.5px] text-muted-foreground">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.body" :class="bodyClass ?? 'p-4'">
      <slot name="body" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string | number; note?: string; small?: boolean }>();
</script>

<template>
  <div class="rounded-lg border bg-card px-4 py-3.5 min-w-0">
    <div class="text-[11.5px] uppercase tracking-wide text-muted-foreground">{{ label }}</div>
    <div
      class="tabular-nums truncate"
      :class="small ? 'mt-1.75 text-base font-semibold' : 'mt-1 text-[22px] font-bold'"
    >
      {{ value }}
    </div>
    <div v-if="note" class="mt-0.5 text-xs text-muted-foreground truncate" :title="note">{{ note }}</div>
  </div>
</template>

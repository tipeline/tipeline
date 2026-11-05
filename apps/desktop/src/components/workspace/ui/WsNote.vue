<script setup lang="ts">
import { Info } from 'lucide-vue-next';
</script>

<template>
  <div
    class="flex items-center gap-2.5 rounded-lg border border-dashed bg-muted px-3.5 py-2.5 text-[12.5px] text-muted-foreground [&_b]:text-foreground [&_b]:font-semibold"
  >
    <Info class="h-3.75 w-3.75 shrink-0" />
    <div class="flex-1 min-w-0"><slot /></div>
    <slot name="action" />
  </div>
</template>

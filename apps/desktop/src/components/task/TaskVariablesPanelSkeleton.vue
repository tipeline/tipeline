<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

withDefaults(defineProps<{ rows?: number }>(), { rows: 4 });
</script>

<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="row in rows"
      :key="row"
      class="flex items-center gap-2 rounded-md border p-2"
    >
      <Skeleton class="h-4 w-4 shrink-0 rounded" />
      <div class="flex flex-1 flex-col gap-1.5">
        <Skeleton class="h-3.5 w-2/5" />
        <Skeleton class="h-3 w-3/5" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton';

withDefaults(defineProps<{ rows?: number }>(), { rows: 6 });
</script>

<template>
  <div class="flex w-full flex-col gap-3">
    <!-- Summary bar -->
    <Skeleton class="h-9 w-full rounded-md" />
    <Skeleton class="h-7 w-40 rounded-md" />
    <div class="flex flex-col">
      <div
        v-for="row in rows"
        :key="row"
        class="grid items-center gap-2.5 border-b px-2.5 py-2.5"
        style="grid-template-columns: 16px 20px minmax(0, 1fr) minmax(80px, 180px) 64px"
      >
        <span />
        <Skeleton class="size-5 rounded-full" />
        <Skeleton class="h-4" :style="{ width: `${30 + ((row * 17) % 40)}%` }" />
        <Skeleton class="h-2 w-full" />
        <Skeleton class="ml-auto h-3 w-10" />
      </div>
    </div>
  </div>
</template>

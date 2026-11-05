<script setup lang="ts">
import Card from '@/components/Card.vue';
import { Skeleton } from '@/components/ui/skeleton';

withDefaults(defineProps<{ rows?: number }>(), { rows: 5 });
</script>

<template>
  <div class="flex flex-col gap-2">
    <Card v-for="row in rows" :key="row" class="py-2" class-content="px-2">
      <template #content>
        <div class="flex items-center gap-3 px-2">
          <Skeleton class="h-4 w-4 shrink-0 rounded" />
          <Skeleton class="h-8 w-8 shrink-0 rounded" />
          <div class="flex flex-1 flex-col gap-1.5 py-1">
            <Skeleton class="h-3.5 w-1/3" />
            <Skeleton class="h-3 w-1/2" />
          </div>
          <Skeleton class="h-6 w-6 shrink-0 rounded" />
        </div>
      </template>
    </Card>
  </div>
</template>

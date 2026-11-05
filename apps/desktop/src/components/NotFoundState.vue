<script setup lang="ts">
import type { Component } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { SearchX } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

withDefaults(
  defineProps<{
    title: string;
    description: string;
    backLabel: string;
    backTo: RouteLocationRaw;
    icon?: Component;
  }>(),
  { icon: () => SearchX }
);
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
    <div class="size-12 rounded-full bg-muted flex items-center justify-center">
      <component :is="icon" class="size-6 text-muted-foreground" />
    </div>
    <h2 class="text-lg font-semibold">{{ title }}</h2>
    <p class="max-w-md text-sm text-muted-foreground">{{ description }}</p>
    <Button as-child variant="outline" class="mt-2">
      <RouterLink :to="backTo">{{ backLabel }}</RouterLink>
    </Button>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const props = defineProps<{
  classContent?: string;
  class?: string;
}>();
</script>

<template>
  <Card
    :class="
      cn('flex flex-col overflow-hidden rounded-md shadow-none', props.class)
    "
  >
    <CardHeader v-if="$slots.title || $slots.actions">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <CardTitle v-if="$slots.title"><slot name="title" /></CardTitle>
        <div v-else />
        <div v-if="$slots.actions" class="flex items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
      <CardDescription><slot name="description" /></CardDescription>
    </CardHeader>
    <CardContent :class="cn('flex-1 overflow-hidden', props.classContent)">
      <slot name="content" />
    </CardContent>
    <CardFooter v-if="$slots.footer">
      <slot name="footer" />
    </CardFooter>
  </Card>
</template>
<style scoped>
.floating-header {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  display: flex;
  align-items: right;
  justify-content: end;
  padding: 4px 8px;
  z-index: 100;
  pointer-events: none;
}
</style>

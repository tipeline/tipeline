<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Skeleton } from '@/components/ui/skeleton';

// The shape a component has while its first data loads, so the page doesn't jump from
// a bare "Loading..." to the real thing. Rough, not exact — enough to read as "coming".
withDefaults(
  defineProps<{
    variant?:
      | 'table'
      | 'list'
      | 'details'
      | 'chart'
      | 'kpi'
      | 'block'
      | 'grid'
      | 'board';
  }>(),
  { variant: 'list' }
);
const { t } = useI18n();

// Uneven widths look like text; equal ones look like stripes.
const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5', 'w-3/5'];
const bars = ['h-2/5', 'h-3/4', 'h-1/2', 'h-full', 'h-3/5', 'h-4/5', 'h-1/3'];
</script>

<template>
  <div
    class="h-full w-full min-h-0 overflow-hidden"
    role="status"
    aria-busy="true"
    :aria-label="t('common.loading')"
    data-testid="app-skeleton"
    :data-variant="variant"
  >
    <!-- header row, then rows of cells -->
    <div v-if="variant === 'table'" class="flex flex-col gap-3 p-3">
      <div class="flex gap-4 pb-2 border-b">
        <Skeleton v-for="c in 4" :key="c" class="h-3 flex-1" />
      </div>
      <div v-for="r in 8" :key="r" class="flex gap-4">
        <Skeleton
          v-for="c in 4"
          :key="c"
          class="h-3 flex-1"
          :class="c === 1 ? '' : 'opacity-70'"
        />
      </div>
    </div>

    <!-- items with a leading dot / avatar and two lines -->
    <div v-else-if="variant === 'list'" class="flex flex-col gap-4 p-3">
      <div v-for="r in 6" :key="r" class="flex items-center gap-3">
        <Skeleton class="size-8 rounded-full shrink-0" />
        <div class="flex-1 flex flex-col gap-1.5">
          <Skeleton class="h-3" :class="widths[r % widths.length]" />
          <Skeleton
            class="h-2.5 opacity-70"
            :class="widths[(r + 2) % widths.length]"
          />
        </div>
      </div>
    </div>

    <!-- label / value pairs -->
    <div v-else-if="variant === 'details'" class="flex flex-col gap-3 p-3">
      <div v-for="r in 6" :key="r" class="flex items-center gap-4">
        <Skeleton class="h-3 w-1/4 shrink-0 opacity-70" />
        <Skeleton class="h-3" :class="widths[r % widths.length]" />
      </div>
    </div>

    <!-- bars on a baseline -->
    <div
      v-else-if="variant === 'chart'"
      class="h-full flex items-end gap-2 p-3 pt-6"
    >
      <Skeleton v-for="(h, i) in bars" :key="i" class="flex-1" :class="h" />
    </div>

    <!-- label, big number, trend -->
    <div
      v-else-if="variant === 'kpi'"
      class="h-full flex flex-col items-center justify-center gap-2 p-3"
    >
      <Skeleton class="h-2.5 w-16 opacity-70" />
      <Skeleton class="h-8 w-24" />
      <Skeleton class="h-2.5 w-10 opacity-70" />
    </div>

    <!-- tiles -->
    <div
      v-else-if="variant === 'grid'"
      class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 p-3"
    >
      <Skeleton v-for="i in 8" :key="i" class="aspect-square" />
    </div>

    <!-- columns of cards -->
    <div v-else-if="variant === 'board'" class="h-full flex gap-3 p-3">
      <div
        v-for="c in 3"
        :key="c"
        class="flex-1 flex flex-col gap-2 rounded-md bg-muted/40 p-2"
      >
        <Skeleton class="h-3 w-1/2 mb-1" />
        <Skeleton v-for="r in 4 - c" :key="r" class="h-14" />
      </div>
    </div>

    <!-- one filled area: an image, a document, a video -->
    <div v-else class="h-full p-3">
      <Skeleton class="h-full w-full" />
    </div>
  </div>
</template>

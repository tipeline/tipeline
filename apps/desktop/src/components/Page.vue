<script setup lang="ts">
defineProps<{
  scrollable?: boolean;
}>();
</script>

<template>
  <!-- min-h-0: lets the page shrink to the space left under the layout header instead of overflowing it -->
  <div class="flex flex-col h-full min-h-0 w-full" :class="{ 'overflow-y-hidden': !$props.scrollable }">
    <div class="flex flex-row justify-between items-center mb-3 shrink-0">
      <div class="flex flex-col">
        <div class="text-sm" v-if="$slots.pretitle">
          <slot name="pretitle" />
        </div>
        <h1 class="text-4xl font-bold w-fit mb-1" v-if="$slots.title">
          <slot name="title" />
        </h1>
        <div v-if="$slots.nav" class="flex flex-row">
          <slot name="nav" />
        </div>
      </div>
      <div v-if="$slots.menu" class="flex items-center gap-2">
        <slot name="menu" />
      </div>
    </div>
    <div
      class="flex flex-col mt-0 mx-auto w-full"
      :class="scrollable ? 'overflow-y-auto scroll-fade flex-1 min-h-0 pb-6' : 'h-full overflow-y-hidden'"
    >
      <slot name="content" />
    </div>
  </div>
</template>

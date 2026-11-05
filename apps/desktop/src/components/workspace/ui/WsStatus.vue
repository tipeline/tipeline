<script setup lang="ts">
defineProps<{ tone?: 'ok' | 'off' | 'warn' | 'bad' }>();
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap">
    <span
      class="h-1.75 w-1.75 rounded-full shrink-0"
      :class="{
        'bg-green-500': !tone || tone === 'ok',
        'bg-muted-foreground': tone === 'off',
        'bg-amber-500': tone === 'warn',
        'bg-destructive': tone === 'bad',
      }"
    />
    <slot />
  </span>
</template>

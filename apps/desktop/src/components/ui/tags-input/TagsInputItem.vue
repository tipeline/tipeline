<script setup lang="ts">
import type { TagsInputItemProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TagsInputItem, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<TagsInputItemProps & { class?: HTMLAttributes['class'] }>();
const forwarded = useForwardProps(props);
</script>

<template>
  <TagsInputItem
    v-bind="forwarded"
    :class="cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground data-[state=active]:bg-secondary/80', props.class)"
  >
    <slot />
  </TagsInputItem>
</template>

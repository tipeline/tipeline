<script setup lang="ts">
import type { TagsInputRootEmits, TagsInputRootProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TagsInputRoot, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<TagsInputRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<TagsInputRootEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <TagsInputRoot
    v-bind="forwarded"
    :class="cn('flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-white dark:bg-input/30 px-2 py-1.5 text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50', props.class)"
  >
    <slot />
  </TagsInputRoot>
</template>

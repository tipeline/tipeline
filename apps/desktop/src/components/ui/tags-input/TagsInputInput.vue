<script setup lang="ts">
import type { TagsInputInputProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TagsInputInput, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<TagsInputInputProps & { class?: HTMLAttributes['class'] }>();
const forwarded = useForwardProps(props);
</script>

<template>
  <TagsInputInput
    v-bind="forwarded"
    :class="cn('flex-1 min-w-20 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed', props.class)"
  />
</template>

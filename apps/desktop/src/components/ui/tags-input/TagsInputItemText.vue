<script setup lang="ts">
import type { TagsInputItemTextProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TagsInputItemText, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<TagsInputItemTextProps & { class?: HTMLAttributes['class'] }>();
const forwarded = useForwardProps(props);
</script>

<template>
  <TagsInputItemText v-bind="forwarded" :class="cn('', props.class)" />
</template>

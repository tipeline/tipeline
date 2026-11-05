<script setup lang="ts">
import type { TagsInputItemDeleteProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { TagsInputItemDelete, useForwardProps } from 'reka-ui';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<TagsInputItemDeleteProps & { class?: HTMLAttributes['class'] }>();
const forwarded = useForwardProps(props);
</script>

<template>
  <TagsInputItemDelete
    v-bind="forwarded"
    :class="cn('ml-0.5 rounded hover:text-foreground transition-colors focus:outline-none', props.class)"
  >
    <X class="w-3 h-3" />
  </TagsInputItemDelete>
</template>

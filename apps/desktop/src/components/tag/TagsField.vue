<script setup lang="ts">
import { normalizeTagLabel, normalizeTagLabels } from '@tipeline/schemas';
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
} from '@/components/ui/tags-input';
import { tagInput } from '@/utils/taskTags';

// The tags field of every workflow form. Tags are lowercase letters, numbers, spaces and
// hyphens: the text is cleaned as it's typed (see tagInput), and a tag that's already
// there clears the box instead of being added twice — `duplicate` lets TagsInput accept
// it, normalizeTagLabels then drops the repeat.
defineProps<{ placeholder?: string }>();
const tags = defineModel<string[]>({ default: () => [] });
</script>

<template>
  <TagsInput
    :model-value="tags"
    duplicate
    :convert-value="normalizeTagLabel"
    @update:model-value="tags = normalizeTagLabels($event)"
  >
    <TagsInputItem v-for="tag in tags" :key="tag" :value="tag">
      <TagsInputItemText />
      <TagsInputItemDelete />
    </TagsInputItem>
    <TagsInputInput :placeholder="placeholder" @input="tagInput" />
  </TagsInput>
</template>

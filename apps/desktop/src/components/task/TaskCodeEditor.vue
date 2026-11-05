<script setup lang="ts">
import { computed } from 'vue';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { useIcon } from '@/composables/useIcon';

const props = defineProps<{
  modelValue: string;
  errors?: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { getIconComponent } = useIcon();
const colorMode = useColorMode();

const extensions = computed(() => {
  const base = [yamlLang(), EditorView.lineWrapping];
  return colorMode.value === 'dark' ? [...base, oneDark] : base;
});
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div
      v-if="props.errors?.length"
      class="m-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive shrink-0"
    >
      <div class="flex items-center gap-1.5 font-medium">
        <component :is="getIconComponent('TriangleAlert')" class="w-4 h-4" />
        {{ $t('builder.codeViewInvalidTask') }}
      </div>
      <ul class="mt-1 ml-5 list-disc space-y-0.5">
        <li v-for="(error, index) in props.errors" :key="index">{{ error }}</li>
      </ul>
    </div>
    <div class="flex-1 min-h-0 overflow-hidden">
      <codemirror
        :model-value="props.modelValue"
        style="height: 100%; width: 100%"
        :autofocus="true"
        :indent-with-tab="true"
        :tab-size="2"
        :extensions="extensions"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { LayoutListIcon, Code2Icon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import ArrayUIInput from './ArrayUIInput.vue';

type Mode = 'ui' | 'raw';

interface Props {
  modelValue: string | any[];
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const mode = ref<Mode>('ui');
const colorMode = useColorMode();

const extensions = computed(() => [
  javascript({}),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
]);

const serialized = computed(() =>
  Array.isArray(props.modelValue)
    ? JSON.stringify(props.modelValue)
    : (props.modelValue as string) ?? ''
);

const isValidArray = computed(() => {
  if (!serialized.value) return true;
  try {
    return Array.isArray(JSON.parse(serialized.value));
  } catch {
    return false;
  }
});

const formatManually = () => {
  if (!serialized.value?.trim()) return;
  try {
    const formatted = JSON.stringify(JSON.parse(serialized.value), null, 2);
    if (formatted !== serialized.value) emit('update:modelValue', formatted);
  } catch {}
};
</script>

<template>
  <div class="space-y-2">
    <div class="flex justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-7 w-7"
        :class="{ 'bg-muted': mode === 'ui' }"
        title="Item list"
        @click="mode = 'ui'"
      >
        <LayoutListIcon :size="14" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-7 w-7"
        :class="{ 'bg-muted': mode === 'raw' }"
        title="Raw JSON editor"
        @click="mode = 'raw'"
      >
        <Code2Icon :size="14" />
      </Button>
    </div>

    <ArrayUIInput
      v-if="mode === 'ui'"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <div v-else class="space-y-1">
      <codemirror
        :model-value="serialized"
        :style="{ height: '300px', width: '100%' }"
        :autofocus="true"
        :indent-with-tab="true"
        :tab-size="2"
        :extensions="extensions"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <div class="flex items-center justify-between">
        <p v-if="serialized && !isValidArray" class="text-xs text-red-500">
          Must be a valid JSON array (e.g., ["item1", "item2"])
        </p>
        <button
          v-if="isValidArray && serialized"
          type="button"
          class="text-xs text-blue-500 hover:text-blue-600 ml-auto"
          @click="formatManually"
        >
          Format JSON
        </button>
      </div>
    </div>
  </div>
</template>

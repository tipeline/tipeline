<script setup lang="ts">
import { ref, computed } from 'vue';
import { javascript } from '@codemirror/lang-javascript';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { LayoutListIcon, Code2Icon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import ObjectUIInput from './ObjectUIInput.vue';
import { parseLenientJsonObject } from '@/utils/lenientJson';

type Mode = 'ui' | 'raw';

interface Props {
  modelValue: string | Record<string, any>;
  placeholder?: string;
  validateJson?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter JSON object (e.g., {"key": "value", "count": 42})',
  validateJson: true,
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
  typeof props.modelValue === 'object' && props.modelValue !== null
    ? JSON.stringify(props.modelValue)
    : (props.modelValue as string) ?? ''
);

const isValidObject = computed(() => {
  if (!serialized.value) return true;
  return parseLenientJsonObject(serialized.value) !== null;
});

const formatManually = () => {
  if (!serialized.value?.trim()) return;
  const parsed = parseLenientJsonObject(serialized.value);
  if (parsed === null) return;
  const formatted = JSON.stringify(parsed, null, 2);
  if (formatted !== serialized.value) emit('update:modelValue', formatted);
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
        title="Property list"
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

    <ObjectUIInput
      v-if="mode === 'ui'"
      :model-value="serialized"
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
        <p v-if="validateJson && modelValue && !isValidObject" class="text-xs text-red-500">
          Must be a valid JSON object (e.g., {"key": "value"})
        </p>
        <button
          v-if="isValidObject && modelValue"
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

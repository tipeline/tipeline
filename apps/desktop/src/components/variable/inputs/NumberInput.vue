<script setup lang="ts">
import { Input } from '@/components/ui/input';

interface Props {
  modelValue: number | string;
  placeholder?: string;
}

interface Emits {
  (e: 'update:modelValue', value: number | string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter a number',
});

const emit = defineEmits<Emits>();

const handleUpdate = (value: number | string) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <Input
    type="number"
    step="any"
    :placeholder="placeholder"
    :model-value="modelValue"
    @update:model-value="handleUpdate"
  />
</template>

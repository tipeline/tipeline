<script setup lang="ts">
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface Props {
  modelValue: string;
  placeholder?: string;
  secret?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter a string value',
  secret: false,
});

const emit = defineEmits<Emits>();

const handleUpdate = (value: string | number) => {
  emit('update:modelValue', String(value));
};
</script>

<template>
  <Input
    v-if="secret"
    type="password"
    autocomplete="off"
    :placeholder="placeholder"
    :model-value="modelValue"
    @update:model-value="handleUpdate"
  />
  <Textarea
    v-else
    :placeholder="placeholder"
    :model-value="modelValue"
    rows="3"
    @update:model-value="handleUpdate"
  />
</template>

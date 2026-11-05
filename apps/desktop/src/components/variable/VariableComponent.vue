<script setup lang="ts">
import { computed } from 'vue';
import { coreValidations } from '@tipeline/schemas';
import StringInput from './inputs/StringInput.vue';
import NumberInput from './inputs/NumberInput.vue';
import BooleanInput from './inputs/BooleanInput.vue';
import ArrayInput from './inputs/ArrayInput.vue';
import ObjectInput from './inputs/ObjectInput.vue';
import DateInput from './inputs/DateInput.vue';

type TypeOption = (typeof coreValidations.varObject.typeOptions)[number];

interface Props {
  type: TypeOption;
  modelValue: any;
  placeholder?: string;
  secret?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: any): void;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '',
});

const emit = defineEmits<Emits>();

// Map types to their corresponding components
const componentMap = {
  string: StringInput,
  number: NumberInput,
  boolean: BooleanInput,
  array: ArrayInput,
  object: ObjectInput,
  date: DateInput,
} as const;

// Compute the component to render based on type
const componentToRender = computed(() => {
  return (componentMap as Record<string, any>)[props.type];
});

// Handle value updates
const handleUpdate = (value: any) => {
  emit('update:modelValue', value);
};
</script>

<template>
  <component
    :is="componentToRender"
    :model-value="modelValue"
    :placeholder="placeholder"
    :secret="type === 'string' ? secret : undefined"
    @update:model-value="handleUpdate"
  />
</template>

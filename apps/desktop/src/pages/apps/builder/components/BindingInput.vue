<script setup lang="ts">
import { computed, inject } from 'vue';
import ExpressionInput from '@/components/ExpressionInput.vue';
import type { BindingSuggestion } from '@/utils/appSuggestions';
import { useBindingAnalyzer } from '@/composables/useBindingAnalyzer';
import { BINDING_SUGGESTIONS } from '../bindingSuggestions';

// An app builder field that can hold bindings: ExpressionInput (the same field workflow
// action params use) with the page's binding suggestions, marking references the way
// every app field does (useBindingAnalyzer).
// `commit` fires on blur, after inserting a binding and on Enter — when to save.
const props = withDefaults(
  defineProps<{
    modelValue: string;
    /** Defaults to the page's, from the properties panel. */
    suggestions?: BindingSuggestion[];
    multiline?: boolean;
    rows?: number;
    placeholder?: string;
    size?: 'default' | 'sm';
    inputClass?: string;
    /** Holds a value, not text (a workflow input): a whole-value pick inserts `{= path =}`. */
    valueField?: boolean;
  }>(),
  {
    suggestions: undefined,
    multiline: false,
    rows: 3,
    placeholder: undefined,
    size: 'sm',
    inputClass: '',
    valueField: false,
  }
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  commit: [value: string];
}>();

const analyze = useBindingAnalyzer();
const injected = inject(BINDING_SUGGESTIONS, null);
const pathSuggestions = computed(() => props.suggestions ?? injected?.page.value ?? []);
</script>

<template>
  <ExpressionInput
    :model-value="props.modelValue ?? ''"
    :suggestions="pathSuggestions"
    :analyze="analyze"
    :multiline="multiline"
    :rows="rows"
    :placeholder="placeholder"
    :size="size"
    :field-class="inputClass"
    :value-field="valueField"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @commit="(v) => emit('commit', v)"
  />
</template>

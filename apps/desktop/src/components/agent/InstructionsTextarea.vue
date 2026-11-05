<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  INSTRUCTIONS_MAX_LENGTH,
  INSTRUCTIONS_RECOMMENDED_LENGTH,
} from '@tipeline/agent/instructions';
import { Textarea } from '@/components/ui/textarea';

// Assistant instructions (global in Settings, per project in its form). They go with every
// request, so past the recommended length a counter asks to keep them short. Other
// attributes (placeholder, class, vee-validate's name/onBlur, FormControl id/aria) go to the textarea.
defineOptions({ inheritAttrs: false });

const props = defineProps<{ modelValue?: string | null }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const { t } = useI18n();
const length = computed(() => String(props.modelValue ?? '').length);
</script>

<template>
  <div class="space-y-1.5">
    <Textarea
      v-bind="$attrs"
      :model-value="props.modelValue ?? ''"
      :maxlength="INSTRUCTIONS_MAX_LENGTH"
      class="min-h-24 max-h-72 font-mono text-xs"
      @update:model-value="(v) => emit('update:modelValue', String(v))"
    />
    <p
      v-if="length > INSTRUCTIONS_RECOMMENDED_LENGTH"
      class="text-xs"
      :class="length >= INSTRUCTIONS_MAX_LENGTH ? 'text-destructive' : 'text-amber-600 dark:text-amber-500'"
    >
      {{ t('agentInstructions.length', { count: length, max: INSTRUCTIONS_MAX_LENGTH }) }}
    </p>
  </div>
</template>

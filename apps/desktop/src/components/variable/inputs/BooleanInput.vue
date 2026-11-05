<script setup lang="ts">
import { Switch } from '@/components/ui/switch';

interface Props {
  modelValue: boolean;
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showLabel: true,
});

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <div class="flex items-center space-x-2">
    <Switch :checked="modelValue" @update:checked="(v: boolean) => emit('update:modelValue', v)" />
    <label v-if="showLabel" class="text-sm">True</label>
  </div>
</template>

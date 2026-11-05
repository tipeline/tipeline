<script setup lang="ts">
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import TemplateField from './TemplateField.vue'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName } from './utils'

const props = defineProps<FieldProps>()

const { value, setValue } = useField<any>(props.fieldName)
</script>

<template>
  <FormItem>
    <AutoFormLabel v-if="!config?.hideLabel" :required="required">
      {{ config?.label || beautifyObjectName(label ?? fieldName) }}
    </AutoFormLabel>
    <TemplateField
      :model-value="typeof value === 'string' ? value : ''"
      multiline
      :disabled="disabled"
      :placeholder="config?.inputProps?.placeholder"
      @update:model-value="setValue"
    />
    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>

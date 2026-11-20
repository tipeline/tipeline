<script setup lang="ts">
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import AutoFormLabel from './AutoFormLabel.vue'
import DateStringInput from './DateStringInput.vue'
import { beautifyObjectName } from './utils'

// A built-in action's date param (`component: 'datestring'`); plugin date params use
// DateStringInput directly.
const props = defineProps<FieldProps>()

const { value, setValue } = useField<any>(props.fieldName)
</script>

<template>
  <FormItem>
    <AutoFormLabel :required="required">
      {{ config?.label || beautifyObjectName(label ?? fieldName) }}
    </AutoFormLabel>
    <DateStringInput :model-value="value" :disabled="disabled" @update:model-value="setValue" />
    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>

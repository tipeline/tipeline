<script setup lang="ts">
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName } from './utils'
import DateInput from '@/components/variable/inputs/DateInput.vue'

const props = defineProps<FieldProps>()

const { value, setValue } = useField<string>(props.fieldName)
</script>

<template>
  <FormItem>
    <AutoFormLabel :required="required">
      {{ config?.label || beautifyObjectName(label ?? fieldName) }}
    </AutoFormLabel>
    <DateInput
      :model-value="value"
      @update:model-value="setValue($event)"
    />
    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>

<script setup lang="ts">
import type { FieldProps } from './interface'
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import TemplateField from './TemplateField.vue'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName, maybeBooleanishToBoolean, TEXT_VARIABLE_TYPES } from './utils'
import { inject } from 'vue'

defineProps<FieldProps>()

const taskVariables = inject('taskVariables', null)
</script>

<template>
  <FormField v-slot="slotProps" :name="fieldName">
    <FormItem v-bind="$attrs">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <slot v-bind="slotProps">
          <!-- A multi-line step param (an AI prompt) can carry variables too; a plain
               textarea is left for forms outside a workflow (a description). -->
          <TemplateField
            v-if="config?.component === 'textarea' && taskVariables"
            multiline
            :model-value="slotProps.componentField.modelValue ?? ''"
            :placeholder="config?.inputProps?.placeholder"
            :disabled="maybeBooleanishToBoolean(config?.inputProps?.disabled) ?? disabled"
            :value-field="valueField"
            :variable-type="config?.variableType ?? TEXT_VARIABLE_TYPES"
            @update:model-value="slotProps.componentField['onUpdate:modelValue']"
          />
          <Textarea
            v-else-if="config?.component === 'textarea'"
            type="text"
            v-bind="{ ...slotProps.componentField, ...config?.inputProps }"
            :disabled="config?.inputProps?.disabled ?? disabled"
          />
          <!-- Every other string field can carry a `{{ variable }}` reference, so it
               renders through the decorated field rather than a plain native input —
               storage stays a plain string either way, this only changes display. -->
          <TemplateField
            v-else
            :model-value="slotProps.componentField.modelValue ?? ''"
            :placeholder="config?.inputProps?.placeholder"
            :disabled="maybeBooleanishToBoolean(config?.inputProps?.disabled) ?? disabled"
            :value-field="valueField"
            :variable-type="config?.variableType"
            @update:model-value="slotProps.componentField['onUpdate:modelValue']"
          />
        </slot>
      </FormControl>
      <FormDescription v-if="config?.description">
        {{ config.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>

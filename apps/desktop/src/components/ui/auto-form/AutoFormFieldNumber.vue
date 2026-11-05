<script setup lang="ts">
import type { FieldProps } from './interface'
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import AutoFormLabel from './AutoFormLabel.vue'
import TemplateField from './TemplateField.vue'
import { beautifyObjectName, maybeBooleanishToBoolean } from './utils'

// A number param can also hold a `{{ variable }}` template (orTemplateString). A number
// input can't show text — it would come up empty and saving would lose the template —
// so a value that isn't a number is shown, and edited, as the template it is.
const isTemplate = (value: unknown) => typeof value === 'string' && value.trim() !== '' && Number.isNaN(Number(value))

defineOptions({
  inheritAttrs: false,
})

defineProps<FieldProps>()
</script>

<template>
  <FormField v-slot="slotProps" :name="fieldName">
    <FormItem>
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <slot v-bind="slotProps">
          <TemplateField
            v-if="isTemplate(slotProps.componentField.modelValue)"
            :model-value="slotProps.componentField.modelValue"
            :placeholder="config?.inputProps?.placeholder"
            :disabled="maybeBooleanishToBoolean(config?.inputProps?.disabled) ?? disabled"
            value-field
            @update:model-value="slotProps.componentField['onUpdate:modelValue']"
          />
          <Input v-else type="number" v-bind="{ ...slotProps.componentField, ...config?.inputProps }" :disabled="config?.inputProps?.disabled ?? disabled" />
        </slot>
      </FormControl>
      <FormDescription v-if="config?.description">
        {{ config.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>

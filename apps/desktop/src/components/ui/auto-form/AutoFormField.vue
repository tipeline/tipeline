<script setup lang="ts" generic="U extends ZodAny">
import type { ZodAny } from 'zod'
import type { Config, ConfigItem, Shape } from './interface'
import { computed } from 'vue'
import { DEFAULT_ZOD_HANDLERS, INPUT_COMPONENTS } from './constant'
import useDependencies from './dependencies'

const props = defineProps<{
  fieldName: string
  shape: Shape
  config?: ConfigItem | Config<U>
}>()

function isValidConfig(config: any): config is ConfigItem {
  return !!config?.component
}

const delegatedProps = computed(() => {
  if (['ZodObject', 'ZodArray', 'ZodRecord'].includes(props.shape?.type))
    return { schema: props.shape?.schema }
  // An any/unknown param takes whatever value it's given — a list, an object, a number —
  // so a reference picked into it should keep that value's type.
  if (['ZodAny', 'ZodUnknown'].includes(props.shape?.type) && !isValidConfig(props.config))
    return { valueField: true }
  return undefined
})

const { isDisabled, isHidden, isRequired, overrideOptions, overrideLabel } = useDependencies(props.fieldName)

const effectiveConfig = computed(() => (
  overrideLabel.value ? { ...props.config, label: overrideLabel.value } : props.config
))
</script>

<template>
  <component
    :is="isValidConfig(config)
      ? typeof config.component === 'string'
        ? INPUT_COMPONENTS[config.component!]
        : config.component
      : INPUT_COMPONENTS[DEFAULT_ZOD_HANDLERS[shape.type]] "
    v-if="!isHidden"
    :field-name="fieldName"
    :label="shape.schema?.description"
    :required="isRequired || shape.required"
    :options="overrideOptions || shape.options"
    :disabled="isDisabled"
    :config="effectiveConfig"
    v-bind="delegatedProps"
  >
    <slot />
  </component>
</template>

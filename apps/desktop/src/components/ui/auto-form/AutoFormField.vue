<script setup lang="ts" generic="U extends ZodAny">
import type { ZodAny } from 'zod'
import type { Config, ConfigItem, Shape } from './interface'
import { computed } from 'vue'
import { DEFAULT_ZOD_HANDLERS, INPUT_COMPONENTS } from './constant'
import useDependencies from './dependencies'
import { defaultVariableType } from './utils'

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
  // A param typed as a value in its fieldConfig (For Each's `iterable`: a list or a template).
  if ((props.config as ConfigItem | undefined)?.valueField)
    return { valueField: true }
  return undefined
})

const { isDisabled, isHidden, isRequired, overrideOptions, overrideLabel } = useDependencies(props.fieldName)

// A text or number param with no `variableType` of its own offers the variables its type
// fits (defaultVariableType), so the `{}` menu doesn't list objects, browsers… in a text box.
const effectiveConfig = computed(() => {
  const config = overrideLabel.value ? { ...props.config, label: overrideLabel.value } : props.config
  const own = config as ConfigItem | undefined
  const variableType = defaultVariableType(props.shape?.type, own)
  return variableType !== undefined && own?.variableType === undefined
    ? { ...own, variableType }
    : config
})
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

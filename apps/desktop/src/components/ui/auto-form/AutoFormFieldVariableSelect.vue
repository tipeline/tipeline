<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'
import { useField } from 'vee-validate'
import { useI18n } from 'vue-i18n'
import type { FieldProps } from './interface'
import { coreValidations } from '@tipeline/schemas'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName } from './utils'

const NONE = '__none__'

const props = defineProps<FieldProps>()
const { t } = useI18n()

const { value, setValue } = useField<string>(props.fieldName)

const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const suggestTaskVariableName = inject<((type: string, base?: string) => string) | null>(
  'suggestTaskVariableName',
  null
)
const registerPendingVariable = inject<((fieldName: string, name: string, type: string) => void) | null>(
  'registerPendingVariable',
  null
)
const unregisterPendingVariable = inject<((fieldName: string) => void) | null>(
  'unregisterPendingVariable',
  null
)

const matchingVariables = computed(() =>
  (taskVariables?.value ?? []).filter((v) => !props.config?.variableType || v.type === props.config.variableType)
)

const variableType = computed(() => props.config?.variableType ?? 'string')
const creatingNew = ref(false)
const newName = ref('')

// Mirrors the live validation the Variables page runs when creating a
// variable (VariableDeferredForm.vue) — invalid or duplicate names are
// flagged as the user types, instead of only surfacing on submit.
const nameError = computed(() => {
  if (!creatingNew.value) return ''
  const trimmed = newName.value.trim()
  if (!trimmed) return ''
  if (!coreValidations.varObject.variableNameSchema.safeParse(trimmed).success) {
    return t('actionEdit.newVariableInvalidName')
  }
  if ((taskVariables?.value ?? []).some((v) => v.name === trimmed)) {
    return t('actionEdit.newVariableDuplicateName')
  }
  return ''
})

function onToggleCreateNew(checked: boolean | 'indeterminate') {
  creatingNew.value = checked === true
  if (creatingNew.value) {
    newName.value = suggestTaskVariableName?.(variableType.value, props.config?.suggestedName) ?? ''
    setValue(newName.value)
    registerPendingVariable?.(props.fieldName, newName.value, variableType.value)
  } else {
    unregisterPendingVariable?.(props.fieldName)
    setValue('')
  }
}

function onNameInput(name: string) {
  newName.value = name
  setValue(name)
  registerPendingVariable?.(props.fieldName, name, variableType.value)
}

onBeforeUnmount(() => {
  if (creatingNew.value) unregisterPendingVariable?.(props.fieldName)
})
</script>

<template>
  <FormItem>
    <div class="flex items-center justify-between gap-2">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <div v-if="registerPendingVariable" class="flex items-center gap-2">
        <Checkbox
          :id="`${fieldName}-createNewVariable`"
          :model-value="creatingNew"
          @update:model-value="onToggleCreateNew"
        />
        <Label :for="`${fieldName}-createNewVariable`" class="font-normal text-xs text-muted-foreground">
          Create new variable
        </Label>
      </div>
    </div>

    <template v-if="creatingNew">
      <Input
        :model-value="newName"
        :disabled="disabled"
        placeholder="New variable name"
        @update:model-value="onNameInput(String($event))"
      />
      <p v-if="nameError" class="text-destructive text-sm">{{ nameError }}</p>
    </template>
    <Select
      v-else
      :model-value="value || NONE"
      :disabled="disabled"
      @update:model-value="setValue($event === NONE ? '' : ($event as string))"
    >
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="config?.inputProps?.placeholder ?? 'Select a variable…'" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="NONE">None</SelectItem>
        <SelectItem v-for="v in matchingVariables" :key="v.name" :value="v.name">
          {{ v.name }}
        </SelectItem>
      </SelectContent>
    </Select>

    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>

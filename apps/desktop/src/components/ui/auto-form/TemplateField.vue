<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import ExpressionInput from '@/components/ExpressionInput.vue'
import { matchesVariableType } from './utils'
import { valuePaths } from '@/utils/expressionField'
import type { ExpressionAnalyzer, ExpressionReference, ExpressionSuggestion } from '@/utils/expressionField'
import { bindingSyntaxIssue, bindingSyntaxMessage } from '@/utils/bindingSyntax'
import {
  findVariableReferenceTokens,
  isKnownVariableName,
  localTemplateBindings,
  textWrappedValueReference,
} from '@/utils/templateReferences'

// A workflow action param that can reference task variables: ExpressionInput (the same
// field the app builder uses for bindings) fed with the variables the action editor
// provides. The value stays a plain string — nothing here changes the schema, IPC
// payload, or how core resolves variables.
//
// `valueField` marks a param that holds a value rather than text (see ExpressionInput):
// picks insert `{= path =}`, and a whole `{{ x }}` on a list, object, number… variable
// is flagged — it would reach the action as text — with a button that switches it.

const props = withDefaults(
  defineProps<{
    // Usually a string, but a YAML-authored param can hold a number, boolean or
    // object (e.g. a condition's `secondOperand: 3`) — shown as its text below.
    modelValue: unknown
    multiline?: boolean
    disabled?: boolean
    placeholder?: string
    valueField?: boolean
    /** Only variables of this type are offered by the `{}` menu and autocomplete. */
    variableType?: string | string[]
  }>(),
  { multiline: false, disabled: false, placeholder: '', valueField: false, variableType: undefined }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()

// The field edits text: a number or boolean shows as its text and an object as JSON.
// The stored value only becomes a string once it's edited.
const text = computed(() => {
  const value = props.modelValue
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
})
const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)

// Object and list variables' known values (last run, else declared), by variable name.
const taskVariableValues = inject<Ref<Record<string, unknown>> | null>('taskVariableValues', null)

// The variables, plus the fields inside object/list ones (`customer.address.city`), each
// checked against the field's type. A nested field comes up once its parent's dot is
// typed — unless the parent itself is filtered out (an object in a list-only field), then
// the list inside it is offered at the top level so it can still be found. Nested fields
// of the wrong type still come up after the dot, dimmed and not pickable, so typing
// `{= myObject.` always shows what's inside.
const wantedTypes = computed(() =>
  Array.isArray(props.variableType) ? props.variableType.join(' / ') : (props.variableType ?? '')
)
const suggestions = computed<ExpressionSuggestion[] | undefined>(() => {
  if (!taskVariables) return undefined
  const out: ExpressionSuggestion[] = []
  for (const v of taskVariables.value) {
    const kept = new Set<string>()
    if (matchesVariableType(v.type, props.variableType)) {
      out.push({ path: v.name, detail: v.type })
      kept.add(v.name)
    }
    const value = taskVariableValues?.value[v.name]
    if (value === undefined) continue
    const parents = new Map<string, string>()
    for (const field of valuePaths(v.name, value)) {
      parents.set(field.path, field.parent)
      if (!matchesVariableType(field.type, props.variableType)) {
        out.push({
          path: field.path,
          detail: t('expressionInput.wrongType', { type: field.type, wanted: wantedTypes.value }),
          parent: field.parent,
          disabled: true,
        })
        continue
      }
      let parent: string | undefined = field.parent
      while (parent !== undefined && !kept.has(parent)) parent = parents.get(parent)
      out.push({ path: field.path, detail: field.type, ...(parent ? { parent } : {}) })
      kept.add(field.path)
    }
  }
  return out
})

const wrapped = computed(() =>
  props.valueField && taskVariables ? textWrappedValueReference(text.value, taskVariables.value) : null
)

function useRawReference() {
  if (wrapped.value) emit('update:modelValue', `{= ${wrapped.value.path} =}`)
}

// core's Liquid instance runs with strictVariables: false (parseParams.ts), so a
// reference to a variable that doesn't exist doesn't error at runtime — it silently
// resolves to an empty string. Nothing else catches that, so this is the only warning
// a typo like `{{ varDontExist }}` will ever get.
const analyze = computed<ExpressionAnalyzer>(() => {
  const knownNames = taskVariables ? new Set(taskVariables.value.map((v) => v.name)) : null
  return (text) => {
    const localNames = localTemplateBindings(text)
    const refs: ExpressionReference[] = findVariableReferenceTokens(text).map((token) => ({
      from: token.from,
      to: token.to,
      issue:
        isKnownVariableName(token.name, knownNames) || localNames.has(token.name)
          ? null
          : { severity: 'error' as const, message: t('expressionInput.unknownVariable', { name: token.name }) },
    }))
    // A malformed one fails the action when it runs.
    const syntax = bindingSyntaxIssue(text)
    if (syntax)
      refs.push({ from: syntax.from, to: syntax.to, issue: { severity: 'error', message: bindingSyntaxMessage(t, syntax) } })
    const asText = props.valueField && knownNames ? textWrappedValueReference(text, taskVariables!.value) : null
    if (asText)
      refs.push({
        from: asText.from,
        to: asText.to,
        issue: { severity: 'warning', message: t('expressionInput.valueAsText', { name: asText.path, type: asText.type }) },
      })
    return refs
  }
})
</script>

<template>
  <div class="min-w-0">
    <ExpressionInput
      :model-value="text"
      :suggestions="suggestions"
      :analyze="analyze"
      :multiline="multiline"
      :rows="4"
      :disabled="disabled"
      :placeholder="placeholder"
      :value-field="valueField"
      field-class="font-mono"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <p v-if="wrapped && !disabled" class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-600 dark:text-amber-400">
      <span>{{ t('expressionInput.valueAsTextHint', { type: wrapped.type }) }}</span>
      <button type="button" class="font-medium underline underline-offset-2 hover:no-underline" @click="useRawReference">
        {{ t('expressionInput.valueAsTextFix', { raw: `{= ${wrapped.path} =}` }) }}
      </button>
    </p>
  </div>
</template>

<script setup lang="ts" generic="T extends z.ZodAny">
import type { Config, ConfigItem } from './interface'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { FormItem, FormMessage } from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusIcon, TrashIcon, LayoutListIcon, Code2Icon, Link2Icon } from 'lucide-vue-next'
import { FieldArray, FieldContextKey, useField } from 'vee-validate'
import { computed, inject, nextTick, provide, ref } from 'vue'
import type { Ref } from 'vue'
import * as z from 'zod'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useColorMode } from '@vueuse/core'
import AutoFormField from './AutoFormField.vue'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName, getBaseSchema, getBaseType } from './utils'
import { parseLenientJsonArray } from '@/utils/lenientJson'

type Mode = 'ui' | 'raw' | 'variable'

const props = defineProps<{
  fieldName: string
  required?: boolean
  config?: Config<T>
  schema?: z.ZodArray<T>
  disabled?: boolean
}>()

function isZodArray(item: z.ZodArray<any> | z.ZodDefault<any>): item is z.ZodArray<any> {
  return item instanceof z.ZodArray
}

function isZodDefault(item: z.ZodArray<any> | z.ZodDefault<any>): item is z.ZodDefault<any> {
  return item instanceof z.ZodDefault
}

const itemShape = computed(() => {
  if (!props.schema) return
  const schema: z.ZodAny = isZodArray(props.schema)
    ? props.schema._def.type
    : isZodDefault(props.schema)
      // @ts-expect-error missing schema
      ? props.schema._def.innerType._def.type
      : null
  const baseItem = getBaseSchema(schema) as z.ZodAny
  let options = (baseItem && 'values' in baseItem._def) ? baseItem._def.values as string[] : undefined
  if (!Array.isArray(options) && typeof options === 'object')
    options = Object.values(options)
  return { type: getBaseType(schema), schema, options }
})

const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const showModeToggle = computed(() => taskVariables !== null)

const fieldContext = useField<any>(props.fieldName)
const { value, setValue } = fieldContext
// @ts-expect-error ignore missing `id`
provide(FieldContextKey, fieldContext)

const isVariableRef = (val: any) =>
  typeof val === 'string' && /^\{=\s*.+\s*=\}$/.test(val.trim())

const initMode = (): Mode => {
  const v = value.value
  if (isVariableRef(v)) return 'variable'
  if (typeof v === 'string') return 'raw'
  return 'ui'
}

const mode = ref<Mode>(initMode())

const filteredVariables = computed(() =>
  (taskVariables?.value ?? []).filter(v => v.type === 'array')
)

// Separate text buffer for the code editor — decoupled from the form value so
// the Zod schema never sees a raw string (which would fail z.array validation).
const rawText = ref(
  typeof value.value === 'string' ? value.value : JSON.stringify(value.value ?? [], null, 2)
)
const jsonError = ref('')

const onRawChange = (val: string) => {
  rawText.value = val
  if (!val.trim()) {
    jsonError.value = ''
    return
  }
  const parsed = parseLenientJsonArray(val)
  if (parsed !== null) {
    setValue(parsed)
    jsonError.value = ''
  } else {
    jsonError.value = 'Must be a valid JSON array (e.g., ["item1", "item2"])'
  }
}

const selectedVariable = computed(() => {
  if (!isVariableRef(value.value)) return ''
  const match = (value.value as string).match(/^\{=\s*(.+?)\s*=\}$/)
  return match ? match[1].trim() : ''
})

const colorMode = useColorMode()
const extensions = computed(() => [
  javascript({}),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
])

const setMode = async (newMode: Mode) => {
  if (mode.value === newMode) return

  if (newMode === 'ui') {
    // Parse the current string value into an array BEFORE mounting FieldArray,
    // so it initialises from the correct value.
    if (typeof value.value === 'string') {
      try {
        const parsed = JSON.parse(value.value)
        setValue(Array.isArray(parsed) ? parsed : [])
      } catch {
        setValue([])
      }
    }
    jsonError.value = ''
    mode.value = 'ui'
  } else {
    // Unmount FieldArray via v-if first, then wait for Vue to flush the DOM
    // update before calling setValue — otherwise vee-validate tries to index
    // into the string as if it were still an array.
    mode.value = newMode
    await nextTick()

    if (newMode === 'raw') {
      // Sync editor text from current form value — do NOT call setValue with a string.
      rawText.value = typeof value.value !== 'string'
        ? JSON.stringify(value.value ?? [], null, 2)
        : value.value
      jsonError.value = ''
    } else if (newMode === 'variable') {
      jsonError.value = ''
    }
  }
}
</script>

<template>
  <section>
    <slot v-bind="props">
      <Accordion type="multiple" class="w-full" collapsible :disabled="disabled" as-child>
        <FormItem>
          <AccordionItem :value="fieldName" class="border-none bg-muted/50 rounded-md px-2">
            <AccordionTrigger>
              <AutoFormLabel class="text-base" :required="required">
                {{ schema?.description || beautifyObjectName(fieldName) }}
              </AutoFormLabel>
            </AccordionTrigger>

            <AccordionContent class="px-1">
              <!-- Mode toggle -->
              <div v-if="showModeToggle" class="flex justify-end gap-1 mb-3">
                <Button
                  type="button" size="icon" variant="ghost" class="h-6 w-6"
                  :class="{ 'bg-muted': mode === 'ui' }"
                  title="Item list"
                  @click="setMode('ui')"
                >
                  <LayoutListIcon :size="13" />
                </Button>
                <Button
                  type="button" size="icon" variant="ghost" class="h-6 w-6"
                  :class="{ 'bg-muted': mode === 'raw' }"
                  title="Raw JSON"
                  @click="setMode('raw')"
                >
                  <Code2Icon :size="13" />
                </Button>
                <Button
                  type="button" size="icon" variant="ghost" class="h-6 w-6"
                  :class="{ 'bg-muted': mode === 'variable' }"
                  title="Assign variable"
                  @click="setMode('variable')"
                >
                  <Link2Icon :size="13" />
                </Button>
              </div>

              <!-- UI mode: existing accordion items -->
              <FieldArray v-if="mode === 'ui'" v-slot="{ fields, remove, push }" as="div" :name="fieldName">
                <template v-for="(field, index) of fields" :key="field.key">
                  <div class="mb-4 p-1">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 min-w-0">
                        <AutoFormField
                          :field-name="`${fieldName}[${index}]`"
                          :label="fieldName"
                          :shape="itemShape!"
                          :config="{ ...(config as ConfigItem), hideLabel: true }"
                        />
                      </div>
                      <Button
                        type="button" size="icon" variant="secondary" class="shrink-0"
                        @click="remove(index)"
                      >
                        <TrashIcon :size="16" />
                      </Button>
                    </div>
                    <Separator v-if="!field.isLast" />
                  </div>
                </template>
                <Button
                  type="button" variant="secondary" class="mt-4 flex items-center"
                  @click="push(null)"
                >
                  <PlusIcon class="mr-2" :size="16" />
                  Add
                </Button>
              </FieldArray>

              <!-- Raw mode: JSON editor -->
              <div v-else-if="mode === 'raw'" class="space-y-1">
                <codemirror
                  :model-value="rawText"
                  :style="{ height: '180px', width: '100%' }"
                  :indent-with-tab="true"
                  :tab-size="2"
                  :extensions="extensions"
                  @update:model-value="onRawChange"
                />
                <p v-if="jsonError" class="text-xs text-red-500">{{ jsonError }}</p>
              </div>

              <!-- Variable mode: picker -->
              <div v-else class="space-y-1">
                <Select :model-value="selectedVariable" @update:model-value="setValue(`{= ${$event} =}`)">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Select a variable…" />
                  </SelectTrigger>
                  <SelectContent>
                    <template v-if="filteredVariables.length > 0">
                      <SelectItem v-for="v in filteredVariables" :key="v.name" :value="v.name">
                        {{ v.name }}
                        <span class="ml-1 text-xs text-muted-foreground">({{ v.type }})</span>
                      </SelectItem>
                    </template>
                    <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">
                      No array variables available
                    </p>
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>

            <FormMessage />
          </AccordionItem>
        </FormItem>
      </Accordion>
    </slot>
  </section>
</template>

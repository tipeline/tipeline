<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useField } from 'vee-validate'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import TemplateField from './TemplateField.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LayoutListIcon, Code2Icon, Link2Icon, PlusIcon, TrashIcon } from 'lucide-vue-next'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useColorMode } from '@vueuse/core'
import AutoFormLabel from './AutoFormLabel.vue'
import { useOpenWhenFilled } from './useOpenWhenFilled'
import AutoFormCodeMirrorEditor from './AutoFormCodeMirrorEditor.vue'
import type { ConfigItem } from './interface'
import { beautifyObjectName } from './utils'
import { parseLenientJsonObject } from '@/utils/lenientJson'

type Mode = 'ui' | 'raw' | 'variable'

const props = defineProps<{
  fieldName: string
  required?: boolean
  disabled?: boolean
  schema?: any
  config?: ConfigItem
}>()

// `anyJson` fields (a request body) hold any value, not just an object: Raw JSON also
// takes arrays, strings and numbers, text that isn't JSON is kept as text (a form-encoded
// or XML body), and the field opens in Raw JSON since bodies are often nested.
const anyJson = computed(() => !!props.config?.anyJson)

// Derive the HTML input type for values from the Zod record's valueType.
// schema is a ZodRecord forwarded by AutoFormField; _def.valueType holds the value schema.
// Used both to render the correct input (number vs text) and to coerce values in pairsToRecord.
const valueInputType = computed(() => {
  const valueTypeName = props.schema?._def?.valueType?._def?.typeName
  return valueTypeName === 'ZodNumber' ? 'number' : 'text'
})

// Values that can be anything (a script's context, sub-workflow props, request params)
// rather than text (headers, output names), and a request body's properties: a reference
// picked into one keeps its type.
const valueEntries = computed(() =>
  anyJson.value || ['ZodAny', 'ZodUnknown'].includes(props.schema?._def?.valueType?._def?.typeName)
)

const { value, setValue } = useField<any>(props.fieldName)
const { open, setOpen } = useOpenWhenFilled(value)

const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const showModeToggle = computed(() => taskVariables !== null)

const isPlainObject = (val: any) =>
  val !== null && typeof val === 'object' && !Array.isArray(val)

const isVariableRef = (val: any) =>
  typeof val === 'string' && /^\{=\s*.+\s*=\}$/.test(val.trim())

const initMode = (): Mode => {
  const v = value.value
  if (isVariableRef(v)) return 'variable'
  if (typeof v === 'string') return 'raw'
  if (anyJson.value && !isPlainObject(v)) return 'raw'
  return 'ui'
}

const mode = ref<Mode>(initMode())

type Pair = { key: string; value: string }

// Convert the UI pairs array into the record object that vee-validate/Zod will validate.
// Input elements always produce string values, so when the schema expects numbers we coerce
// them here — scoped to number fields only so string records never get their values changed.
// Values that START with { or [ are treated as JSON and parsed back to objects/arrays.
const pairsToRecord = (p: Pair[]): Record<string, any> => {
  const record: Record<string, any> = {}
  for (const pair of p) {
    if (pair.key) {
      if (valueInputType.value === 'number') {
        const num = Number(pair.value)
        record[pair.key] = pair.value !== '' && !isNaN(num) ? num : pair.value
      } else {
        const trimmed = pair.value.trim()
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(pair.value)
            record[pair.key] = typeof parsed === 'object' && parsed !== null ? parsed : pair.value
          } catch {
            record[pair.key] = pair.value
          }
        } else {
          record[pair.key] = pair.value
        }
      }
    }
  }
  return record
}

const valToString = (val: unknown): string => {
  if (val !== null && typeof val === 'object') return JSON.stringify(val)
  return String(val ?? '')
}

const initPairs = (): Pair[] => {
  const v = value.value
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v).map(([k, val]) => ({ key: k, value: valToString(val) }))
  }
  return []
}

const pairs = ref<Pair[]>(initPairs())

watch(pairs, (newPairs) => {
  if (mode.value === 'ui') setValue(pairsToRecord(newPairs))
}, { deep: true })

const filteredVariables = computed(() =>
  (taskVariables?.value ?? []).filter(v => anyJson.value || v.type === 'object')
)

// Separate text buffer for the code editor — decoupled from the form value so
// the Zod schema never sees a raw string (which would fail z.record validation).
const toRawText = (val: unknown): string => {
  if (typeof val === 'string') return val
  if (val === undefined && anyJson.value) return ''
  return JSON.stringify(val ?? {}, null, 2)
}
const rawText = ref(toRawText(value.value))
const jsonError = ref('')
const sentAsText = ref(false)

const onRawChange = (val: string) => {
  rawText.value = val
  if (anyJson.value) {
    jsonError.value = ''
    sentAsText.value = false
    if (!val.trim()) {
      setValue(undefined)
      return
    }
    const parsed = parseLenientJsonObject(val)
    if (parsed !== null) {
      setValue(parsed)
      return
    }
    try {
      setValue(JSON.parse(val))
    } catch {
      setValue(val)
      sentAsText.value = !isVariableRef(val)
    }
    return
  }
  if (!val.trim()) {
    jsonError.value = ''
    return
  }
  const parsed = parseLenientJsonObject(val)
  if (parsed !== null) {
    setValue(parsed)
    jsonError.value = ''
  } else {
    jsonError.value = 'Must be a valid JSON object (e.g., {"key": "value"})'
  }
}

const selectedVariable = computed(() => {
  if (!isVariableRef(value.value)) return ''
  const match = (value.value as string).match(/^\{=\s*(.+?)\s*=\}$/)
  return match ? match[1].trim() : ''
})

const colorMode = useColorMode()
// Property list only holds a flat object; switching to it from an array or plain text
// would throw that value away, so it's off until the value is an object again.
const canUseList = computed(() => {
  if (!anyJson.value) return true
  const v = value.value
  return v === undefined || v === '' || isPlainObject(v)
})

const extensions = computed(() => [
  javascript({}),
  EditorView.lineWrapping,
  ...(colorMode.value === 'dark' ? [oneDark] : []),
])

const setMode = async (newMode: Mode) => {
  if (mode.value === newMode) return

  if (newMode === 'ui') {
    // Re-build pairs from the current form value before switching.
    // value.value may be an object (edited in code mode) or a string (variable ref / raw text).
    const current = value.value
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      pairs.value = Object.entries(current).map(([k, v]) => ({ key: k, value: valToString(v) }))
    } else if (typeof current === 'string') {
      try {
        const parsed = JSON.parse(current)
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          setValue(parsed)
          pairs.value = Object.entries(parsed).map(([k, v]) => ({ key: k, value: valToString(v) }))
        } else {
          setValue({})
          pairs.value = []
        }
      } catch {
        setValue({})
        pairs.value = []
      }
    }
    mode.value = 'ui'
  } else {
    mode.value = newMode
    await nextTick()

    if (newMode === 'raw') {
      // Sync editor text from current form value — do NOT call setValue with a string.
      rawText.value = toRawText(value.value)
      jsonError.value = ''
      sentAsText.value = false
    } else if (newMode === 'variable') {
      jsonError.value = ''
    }
  }
}

const addPair = () => pairs.value.push({ key: '', value: '' })
const removePair = (i: number) => pairs.value.splice(i, 1)
</script>

<template>
  <Accordion
    type="single"
    as-child
    class="w-full"
    collapsible
    :disabled="disabled"
    :model-value="open ? fieldName : ''"
    @update:model-value="(v) => setOpen(v === fieldName)"
  >
    <FormItem>
      <AccordionItem :value="fieldName" class="border-none bg-muted/50 rounded-md px-2">
        <AccordionTrigger>
          <AutoFormLabel class="text-base" :required="required">
            {{ config?.label || beautifyObjectName(fieldName) }}
          </AutoFormLabel>
        </AccordionTrigger>

        <AccordionContent class="p-1 space-y-2">
          <!-- Mode toggle -->
          <div v-if="showModeToggle" class="flex justify-end gap-1">
            <Button
              type="button" size="icon" variant="ghost" class="h-6 w-6"
              :class="{ 'bg-muted': mode === 'ui' }"
              :disabled="!canUseList"
              :title="canUseList ? 'Property list' : 'Property list (only for a JSON object)'"
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

          <!-- UI mode: key-value pairs -->
          <template v-if="mode === 'ui'">
            <div v-for="(pair, index) in pairs" :key="index" class="flex items-center gap-2">
              <Input v-model="pair.key" placeholder="Key" :disabled="disabled" class="flex-1 min-w-0" />
              <Input v-if="valueInputType === 'number'" v-model="pair.value" type="number" placeholder="Value" :disabled="disabled" class="flex-1 min-w-0" />
              <TemplateField v-else v-model="pair.value" placeholder="Value" :disabled="disabled" :value-field="valueEntries" class="flex-1 min-w-0" />
              <Button type="button" size="icon" variant="secondary" @click="removePair(index)">
                <TrashIcon :size="16" />
              </Button>
            </div>
            <Button type="button" variant="secondary" class="mt-2 flex items-center" @click="addPair">
              <PlusIcon class="mr-2" :size="16" />
              Add
            </Button>
          </template>

          <!-- Raw mode: JSON editor -->
          <div v-else-if="mode === 'raw'" class="space-y-1">
            <AutoFormCodeMirrorEditor
              :model-value="rawText"
              :extensions="extensions"
              :disabled="disabled"
              :label="config?.label || beautifyObjectName(fieldName)"
              :height="anyJson ? '240px' : '180px'"
              @update:model-value="onRawChange"
            />
            <p v-if="jsonError" class="text-xs text-red-500">{{ jsonError }}</p>
            <p v-else-if="sentAsText" class="text-xs text-muted-foreground">
              Not JSON — sent as text.
            </p>
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
                  No object variables available
                </p>
              </SelectContent>
            </Select>
          </div>

          <FormDescription v-if="config?.description">
            {{ config.description }}
          </FormDescription>
          <FormMessage />
        </AccordionContent>
      </AccordionItem>
    </FormItem>
  </Accordion>
</template>

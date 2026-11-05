<script setup lang="ts">
import { computed, inject, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { CalendarDate, DateFormatter } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { CalendarIcon, Code2Icon, Link2Icon } from 'lucide-vue-next'
import { useTimezone, parseDateInTZ, calendarDateToUTCISO } from '@/composables/useTimezone'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName } from './utils'

type Mode = 'calendar' | 'code' | 'variable'

const props = defineProps<FieldProps>()

const { value, setValue } = useField<any>(props.fieldName)

const { appTimezone } = useTimezone()
const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const showModeToggle = computed(() => taskVariables !== null)

const df = new DateFormatter('en-US', { dateStyle: 'long' })

const isVariableRef = (val: any) =>
  typeof val === 'string' && /^\{=\s*.+\s*=\}$/.test(val.trim())

const initMode = (): Mode => {
  const v = value.value
  if (isVariableRef(v)) return 'variable'
  if (typeof v === 'string' && v) {
    if (parseDateInTZ(v, appTimezone.value)) return 'calendar'
    return 'code'
  }
  return 'calendar'
}

const mode = ref<Mode>(initMode())

const initFromValue = () => {
  const v = value.value
  if (typeof v === 'string' && v && !isVariableRef(v)) {
    return parseDateInTZ(v, appTimezone.value) ?? { date: undefined as CalendarDate | undefined, time: '00:00' }
  }
  return { date: undefined as CalendarDate | undefined, time: '00:00' }
}

const initial = initFromValue()
const localTime = ref<string>(initial.time)
const calendarDate = shallowRef<CalendarDate | undefined>(initial.date)

watch(calendarDate, (newDate) => {
  if (mode.value === 'calendar') {
    setValue(newDate ? calendarDateToUTCISO(newDate, localTime.value, appTimezone.value) : '')
  }
})

watch(localTime, () => {
  if (mode.value === 'calendar' && calendarDate.value) {
    setValue(calendarDateToUTCISO(calendarDate.value, localTime.value, appTimezone.value))
  }
})

const calendarLabel = computed(() =>
  calendarDate.value
    ? df.format(calendarDate.value.toDate(appTimezone.value))
    : 'Pick a date'
)

// Cast to satisfy reka-ui CalendarRootProps which expects DateValue | DateValue[]
const calendarModelValue = computed(() => calendarDate.value as DateValue | undefined)

const filteredVariables = computed(() =>
  (taskVariables?.value ?? []).filter(v => ['string', 'datetime', 'date'].includes(v.type))
)

const selectedVariable = computed(() => {
  if (!isVariableRef(value.value)) return ''
  const match = (value.value as string).match(/^\{=\s*(.+?)\s*=\}$/)
  return match ? match[1].trim() : ''
})

const setMode = (newMode: Mode) => {
  if (mode.value === newMode) return
  mode.value = newMode

  if (newMode === 'calendar') {
    const currentVal = typeof value.value === 'string' ? value.value : ''
    const parsed = parseDateInTZ(currentVal, appTimezone.value)
    if (parsed) {
      calendarDate.value = parsed.date
      localTime.value = parsed.time
      setValue(calendarDateToUTCISO(parsed.date, parsed.time, appTimezone.value))
    } else {
      calendarDate.value = undefined
      setValue('')
    }
  } else if (newMode === 'code') {
    if (typeof value.value !== 'string') setValue('')
  }
}
</script>

<template>
  <FormItem>
    <div class="flex items-center justify-between">
      <AutoFormLabel :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <div v-if="showModeToggle" class="flex gap-1">
        <Button
          type="button" size="icon" variant="ghost" class="h-6 w-6"
          :class="{ 'bg-muted': mode === 'calendar' }"
          title="Date picker"
          @click="setMode('calendar')"
        >
          <CalendarIcon :size="13" />
        </Button>
        <Button
          type="button" size="icon" variant="ghost" class="h-6 w-6"
          :class="{ 'bg-muted': mode === 'code' }"
          title="Raw text / template"
          @click="setMode('code')"
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
    </div>

    <!-- Calendar mode -->
    <div v-if="mode === 'calendar'" class="flex gap-2">
      <Popover>
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="outline"
            :disabled="disabled"
            :class="cn('flex-1 justify-start text-left font-normal', !calendarDate && 'text-muted-foreground')"
          >
            <CalendarIcon class="mr-2 h-4 w-4" />
            {{ calendarLabel }}
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-0">
          <Calendar
            initial-focus
            :model-value="calendarModelValue"
            @update:model-value="(v: DateValue | undefined) => { calendarDate = v ? v as CalendarDate : undefined }"
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        :model-value="localTime"
        :disabled="disabled"
        class="w-32 bg-background"
        @update:model-value="localTime = String($event)"
      />
    </div>

    <!-- Code mode -->
    <Input
      v-else-if="mode === 'code'"
      type="text"
      :model-value="typeof value === 'string' ? value : ''"
      :disabled="disabled"
      placeholder="e.g. {{ myDateVar }} or 2024-01-15"
      @update:model-value="setValue($event)"
    />

    <!-- Variable mode -->
    <Select
      v-else
      :model-value="selectedVariable"
      @update:model-value="setValue(`{= ${$event} =}`)"
    >
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
          No string/datetime variables available
        </p>
      </SelectContent>
    </Select>

    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>

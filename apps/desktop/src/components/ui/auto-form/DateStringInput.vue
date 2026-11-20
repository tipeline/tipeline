<script setup lang="ts">
import { computed, inject, ref, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { CalendarDate, DateFormatter } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { Braces, CalendarIcon } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTimezone, parseDateInTZ, calendarDateToUTCISO } from '@/composables/useTimezone'
import TemplateField from './TemplateField.vue'

// A date param: picked on a calendar, or written as an expression — a date, a
// `{{ template }}` or a `{= dateVar =}` binding — in the same field the other params use
// (autocomplete, `{}` menu). Switching modes never clears the value: the calendar only
// writes once a day or time is picked.

type Mode = 'calendar' | 'expression'

const props = defineProps<{
  modelValue?: unknown
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { appTimezone } = useTimezone()
const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const showModeToggle = computed(() => taskVariables !== null)

const df = new DateFormatter('en-US', { dateStyle: 'long' })

const text = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
const parse = (value: string) => (value ? parseDateInTZ(value, appTimezone.value) : null)

// A value the calendar can't show (a template, a binding) opens as an expression.
const mode = ref<Mode>(text.value && !parse(text.value) ? 'expression' : 'calendar')

const initial = parse(text.value)
const localTime = ref<string>(initial?.time ?? '00:00')
const calendarDate = shallowRef<CalendarDate | undefined>(initial?.date)

const writeCalendar = () => {
  if (calendarDate.value)
    emit('update:modelValue', calendarDateToUTCISO(calendarDate.value, localTime.value, appTimezone.value))
}
const pickDate = (v: DateValue | undefined) => {
  calendarDate.value = v ? (v as CalendarDate) : undefined
  if (calendarDate.value) writeCalendar()
  else emit('update:modelValue', '')
}
const pickTime = (v: string | number) => {
  localTime.value = String(v)
  writeCalendar()
}

const calendarLabel = computed(() =>
  calendarDate.value ? df.format(calendarDate.value.toDate(appTimezone.value)) : 'Pick a date'
)
// The expression the calendar is standing in for, while it holds one.
const heldExpression = computed(() => (text.value && !parse(text.value) ? text.value : ''))

const setMode = (newMode: Mode) => {
  if (mode.value === newMode) return
  if (newMode === 'calendar') {
    const parsed = parse(text.value)
    calendarDate.value = parsed?.date
    if (parsed) localTime.value = parsed.time
  }
  mode.value = newMode
}
</script>

<template>
  <div>
    <div v-if="showModeToggle" class="flex justify-end gap-1 mb-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-6 w-6"
        :class="{ 'bg-muted': mode === 'calendar' }"
        title="Date picker"
        @click="setMode('calendar')"
      >
        <CalendarIcon :size="13" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="h-6 w-6"
        :class="{ 'bg-muted': mode === 'expression' }"
        title="Expression or variable"
        @click="setMode('expression')"
      >
        <Braces :size="13" />
      </Button>
    </div>

    <template v-if="mode === 'calendar'">
      <div class="flex gap-2">
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
              :model-value="calendarDate as DateValue | undefined"
              @update:model-value="pickDate"
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          :model-value="localTime"
          :disabled="disabled"
          class="w-32 bg-background"
          @update:model-value="pickTime"
        />
      </div>
      <p v-if="heldExpression" class="mt-1 text-xs text-muted-foreground">
        Uses <code class="font-mono">{{ heldExpression }}</code>. Picking a date replaces it.
      </p>
    </template>

    <TemplateField
      v-else
      :model-value="text"
      value-field
      :variable-type="['string', 'date']"
      :disabled="disabled"
      placeholder="2024-01-15, {{ myDate }} or {= myDate =}"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
  </div>
</template>

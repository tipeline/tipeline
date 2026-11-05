<script setup lang="ts">
import { ref } from 'vue';
import type { DateValue } from '@internationalized/date';
import { CalendarDate } from '@internationalized/date';
import { ChevronDownIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTimezone, parseDateInTZ, calendarDateToUTCISO } from '@/composables/useTimezone';

interface Props {
  modelValue?: string | Date;
  placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Select date',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { appTimezone } = useTimezone();

const parseInitial = (val: string | Date | undefined) => {
  if (!val) return { date: undefined as CalendarDate | undefined, time: '00:00' };
  const str =
    val instanceof Date
      ? val.toISOString()
      : String(val);
  const parsed = parseDateInTZ(str, appTimezone.value);
  return parsed ?? { date: undefined as CalendarDate | undefined, time: '00:00' };
};

const initial = parseInitial(props.modelValue);
const localDate = ref<DateValue | undefined>(initial.date);
const localTime = ref(initial.time);
const open = ref(false);

const emitCombined = () => {
  if (!localDate.value) return;
  emit('update:modelValue', calendarDateToUTCISO(localDate.value as CalendarDate, localTime.value, appTimezone.value));
};

const handleDateChange = (value: DateValue | undefined) => {
  if (value) {
    localDate.value = value;
    open.value = false;
    emitCombined();
  }
};
</script>

<template>
  <div class="flex gap-4">
    <div class="flex flex-col gap-2">
      <Label class="px-1 text-xs text-muted-foreground">Date</Label>
      <Popover v-model:open="open">
        <PopoverTrigger as-child>
          <Button variant="outline" class="w-36 justify-between font-normal">
            {{ localDate ? (localDate as CalendarDate).toDate(appTimezone).toLocaleDateString() : placeholder }}
            <ChevronDownIcon class="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-auto overflow-hidden p-0" align="start">
          <Calendar :model-value="(localDate as any)" @update:model-value="handleDateChange" />
        </PopoverContent>
      </Popover>
    </div>

    <div class="flex flex-col gap-2">
      <Label class="px-1 text-xs text-muted-foreground">Time</Label>
      <Input
        type="time"
        :model-value="localTime"
        class="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        @update:model-value="(v) => { localTime = String(v); emitCombined(); }"
      />
    </div>
  </div>
</template>

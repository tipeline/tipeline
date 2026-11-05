<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDate, type DateValue } from '@internationalized/date';
import { CalendarRange, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RangeCalendar } from '@/components/ui/range-calendar';
import { cn } from '@/lib/utils';
import {
  DATE_RANGE_PRESETS,
  fromDay,
  presetRange,
  toDayRange,
  type DateRangePreset,
  type DayRange,
} from '@/utils/appDates';

// Picks a range of days. Its value is `<id>.value` = { from, to } ("YYYY-MM-DD", in
// the user's timezone) or null, also as `<id>.from` / `<id>.to` — e.g. a history
// runnable's dateFrom / dateTo. The calendar shows two months; presets fill it in one
// click.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t, locale } = useI18n();

const range = computed<DayRange | null>(() => toDayRange(props.state?.value));
const open = ref(false);

function update(next: DayRange | null) {
  const patch = { value: next, from: next?.from ?? null, to: next?.to ?? null };
  // Picking a range clears a stepper's "required" error.
  emit('state', { ...patch, error: null });
  emit('event', 'change', patch);
}

// ---- calendar (DateValue) ↔ days ("YYYY-MM-DD")
const toCalendar = (day: string) => {
  const d = fromDay(day);
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const calendarValue = () =>
  range.value ? { start: toCalendar(range.value.from), end: toCalendar(range.value.to) } : undefined;

// The calendar edits a draft: a start without an end yet stays in it, and only a
// whole range is committed. Opening the popover starts again from the current range.
const draft = ref<{ start?: DateValue; end?: DateValue } | undefined>(calendarValue());
watch(open, (isOpen) => {
  if (isOpen) draft.value = calendarValue();
});

function onCalendar(value: { start?: DateValue; end?: DateValue } | undefined) {
  draft.value = value;
  if (!value?.start || !value.end) return; // still choosing the end
  update({ from: value.start.toString(), to: value.end.toString() });
  open.value = false;
}

function pickPreset(preset: DateRangePreset) {
  update(presetRange(preset));
  open.value = false;
}

// The preset the current range matches, to mark it in the list.
const activePreset = computed(() =>
  range.value
    ? DATE_RANGE_PRESETS.find((p) => {
        const r = presetRange(p);
        return r.from === range.value!.from && r.to === range.value!.to;
      })
    : undefined
);

const label = computed(() => {
  if (!range.value) return '';
  const format = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' });
  const from = fromDay(range.value.from);
  const to = fromDay(range.value.to);
  return range.value.from === range.value.to ? format.format(from) : format.formatRange(from, to);
});
</script>

<template>
  <div class="h-full overflow-auto p-(--app-pad) flex flex-col gap-1.5">
    <Label v-if="props.props.label" :for="`app-${componentId}`" class="text-sm"
      >{{ props.props.label
      }}<span v-if="props.props.required" class="text-destructive"> *</span></Label
    >
    <Popover v-model:open="open">
      <div class="relative">
        <PopoverTrigger as-child>
          <Button
            :id="`app-${componentId}`"
            variant="outline"
            :disabled="editable"
            :class="cn('w-full justify-start font-normal pr-8', !range && 'text-muted-foreground')"
          >
            <CalendarRange class="size-4 shrink-0" />
            <span class="truncate">{{ label || props.props.placeholder || t('apps.dateRange.placeholder') }}</span>
          </Button>
        </PopoverTrigger>
        <button
          v-if="range && !props.props.required && !editable"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
          :title="t('apps.dateRange.clear')"
          @click="update(null)"
        >
          <X class="size-3.5" />
        </button>
      </div>
      <PopoverContent class="w-auto p-0 flex" align="start">
        <div v-if="!props.props.hidePresets" class="flex flex-col gap-0.5 border-r p-2 min-w-32">
          <Button
            v-for="preset in DATE_RANGE_PRESETS"
            :key="preset"
            size="sm"
            :variant="activePreset === preset ? 'secondary' : 'ghost'"
            class="justify-start h-7 text-xs font-normal"
            @click="pickPreset(preset)"
          >
            {{ t(`apps.dateRange.presets.${preset}`) }}
          </Button>
        </div>
        <RangeCalendar
          :model-value="(draft as any)"
          :number-of-months="2"
          :locale="locale"
          @update:model-value="(v: any) => onCalendar(v)"
        />
      </PopoverContent>
    </Popover>
    <p v-if="props.props.description" class="text-xs text-muted-foreground m-0">
      {{ props.props.description }}
    </p>
    <p v-if="state?.error" class="text-xs text-destructive m-0">
      {{ t(`apps.field.errors.${state.error}`) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDate, type DateValue } from '@internationalized/date';
import { CalendarDays, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// A date — or a date and time — picked on Tipeline's calendar, like a Date range
// component's (not the browser's own picker). The value stays the plain text the
// browser's inputs give: "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM" with `withTime`.
const props = defineProps<{
  id: string;
  modelValue: unknown;
  withTime?: boolean;
  placeholder?: string;
  /** No clear button: a value is always set. */
  required?: boolean;
  editable?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; blur: [] }>();
const { t, locale } = useI18n();

const open = ref(false);
const text = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''));
const day = computed(() => (/^\d{4}-\d{2}-\d{2}/.test(text.value) ? text.value.slice(0, 10) : ''));
const time = computed(() => (/T(\d{2}:\d{2})/.exec(text.value)?.[1] ?? ''));

const calendarValue = computed(() => {
  if (!day.value) return undefined;
  const [y, m, d] = day.value.split('-').map(Number);
  return new CalendarDate(y, m, d);
});

const pad = (n: number) => String(n).padStart(2, '0');
function pickDay(value: DateValue | undefined) {
  if (!value) return;
  const picked = `${value.year}-${pad(value.month)}-${pad(value.day)}`;
  emit('update:modelValue', props.withTime ? `${picked}T${time.value || '09:00'}` : picked);
  if (!props.withTime) open.value = false; // a time may still follow
}
function pickTime(value: string | number) {
  const hhmm = String(value);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return;
  const today = new Date();
  const base = day.value || `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  emit('update:modelValue', `${base}T${hhmm}`);
}

const label = computed(() => {
  if (!day.value) return '';
  const [y, m, d] = day.value.split('-').map(Number);
  const date = new Date(y, m - 1, d, ...(time.value ? (time.value.split(':').map(Number) as [number, number]) : [0, 0]));
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    ...(props.withTime && time.value ? { timeStyle: 'short' } : {}),
  }).format(date);
});

function onOpen(next: boolean) {
  open.value = next;
  if (!next) emit('blur');
}
</script>

<template>
  <Popover :open="open" @update:open="onOpen">
    <div class="relative">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          variant="outline"
          :disabled="editable"
          :class="cn('w-full justify-start font-normal pr-8', !label && 'text-muted-foreground')"
          data-testid="date-trigger"
        >
          <CalendarDays class="size-4 shrink-0" />
          <span class="truncate">{{ label || placeholder || (withTime ? t('apps.field.pickDateTime') : t('apps.field.pickDate')) }}</span>
        </Button>
      </PopoverTrigger>
      <button
        v-if="label && !required && !editable"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
        :title="t('common.clear')"
        :aria-label="t('common.clear')"
        @click="emit('update:modelValue', '')"
      >
        <X class="size-3.5" />
      </button>
    </div>
    <PopoverContent class="w-auto p-0" align="start">
      <Calendar :model-value="(calendarValue as any)" :locale="locale" initial-focus @update:model-value="(v: any) => pickDay(v)" />
      <div v-if="withTime" class="flex items-center gap-2 border-t px-3 py-2 text-sm">
        <span class="text-muted-foreground">{{ t('apps.field.time') }}</span>
        <input
          type="time"
          class="ml-auto rounded-md border bg-transparent px-2 py-1 text-sm"
          :value="time"
          data-testid="date-time"
          @change="(e) => pickTime((e.target as HTMLInputElement).value)"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>

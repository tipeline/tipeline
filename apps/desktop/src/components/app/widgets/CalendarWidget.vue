<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import FullCalendar from '@fullcalendar/vue3';
import type { CalendarOptions, DatesSetArg, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { dayOf, eventsFrom } from '@/utils/appCalendar';

// Rows as events on a month / week / day / list calendar (FullCalendar; this whole
// component loads only when a calendar is shown). A date alone is an all-day event, a
// date and time sits at its hour; colors follow badges. Clicking an event fires
// `eventClick` (`selectedEvent`); clicking or dragging over days fires `dateSelect`
// (`selectedDate`, `selectedStart` / `selectedEnd`); moving to other dates fires
// `rangeChange` with the visible days in `from` / `to` — e.g. a runnable's inputs.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t, locale } = useI18n();

const VIEWS = { month: 'dayGridMonth', week: 'timeGridWeek', day: 'timeGridDay', list: 'listWeek' } as const;
type ViewName = keyof typeof VIEWS;

const today = new Date();
const at = (days: number, hour?: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hour ?? 0);
  return hour === undefined ? dayOf(d) : d.toISOString();
};
const SAMPLE = [
  { title: 'Planning', start: at(0, 9), end: at(0, 10), status: 'active' },
  { title: 'Delivery', start: at(2), status: 'pending' },
  { title: 'Review', start: at(5, 14), status: 'closed' },
];
const sample = computed(() => props.editable && typeof props.props.data === 'string');

const events = computed(() =>
  eventsFrom(sample.value ? SAMPLE : props.props.data, {
    titleKey: props.props.titleKey,
    startKey: props.props.startKey,
    endKey: props.props.endKey,
    colorKey: sample.value ? 'status' : props.props.colorKey,
    colors: props.props.colors,
    defaultColor: props.props.defaultColor,
  })
);

const calendar = ref<InstanceType<typeof FullCalendar> | null>(null);
const api = () => calendar.value?.getApi();
const title = ref('');
const view = ref<ViewName>((Object.keys(VIEWS) as ViewName[]).includes(props.props.view) ? props.props.view : 'month');
const shownViews = computed<ViewName[]>(() => {
  const list = Array.isArray(props.props.views) ? props.props.views.filter((v: string) => v in VIEWS) : [];
  return list.length ? list : ['month', 'week', 'day', 'list'];
});

const lastRange = shallowRef<string>('');
const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: VIEWS[view.value],
  initialDate: typeof props.props.initialDate === 'string' && props.props.initialDate ? props.props.initialDate : undefined,
  headerToolbar: false,
  height: '100%',
  locales: [esLocale],
  locale: locale.value.startsWith('es') ? 'es' : 'en',
  firstDay: props.props.firstDay === 1 || props.props.firstDay === '1' ? 1 : undefined,
  nowIndicator: true,
  dayMaxEvents: true,
  selectable: !props.editable,
  events: events.value,
  datesSet: (info: DatesSetArg) => {
    title.value = info.view.title;
    const end = new Date(info.end.getTime() - 1);
    const range = { from: dayOf(info.start), to: dayOf(end) };
    emit('state', range);
    // The first range too: a runnable wired to rangeChange loads what's shown.
    const key = `${range.from}/${range.to}`;
    if (!props.editable && key !== lastRange.value) {
      lastRange.value = key;
      emit('event', 'rangeChange', range);
    }
  },
  eventClick: (info: EventClickArg) => {
    info.jsEvent.preventDefault(); // events with a url don't navigate the app
    if (props.editable) return;
    const { row, index } = info.event.extendedProps as { row: Record<string, unknown>; index: number };
    emit('event', 'eventClick', { selectedEvent: row, selectedIndex: index });
  },
  dateClick: (info: DateClickArg) => {
    if (props.editable) return;
    const day = dayOf(info.date);
    emit('event', 'dateSelect', {
      selectedDate: day,
      selectedStart: info.allDay ? day : info.date.toISOString(),
      selectedEnd: info.allDay ? day : info.date.toISOString(),
    });
  },
  select: (info: DateSelectArg) => {
    if (props.editable) return;
    // A one-day click comes through dateClick; this is a drag over several.
    const lastDay = new Date(info.end.getTime() - 1);
    if (info.allDay && dayOf(info.start) === dayOf(lastDay)) return;
    emit('event', 'dateSelect', {
      selectedDate: dayOf(info.start),
      selectedStart: info.allDay ? dayOf(info.start) : info.start.toISOString(),
      selectedEnd: info.allDay ? dayOf(lastDay) : info.end.toISOString(),
    });
  },
}));

function go(step: 'prev' | 'next' | 'today') {
  api()?.[step]();
}
function show(name: ViewName) {
  view.value = name;
  api()?.changeView(VIEWS[name]);
}
</script>

<template>
  <div class="h-full flex flex-col min-h-0 app-calendar">
    <div class="flex flex-wrap items-center gap-1.5 border-b px-(--app-pad-tight) py-1.5 shrink-0">
      <Button variant="outline" size="icon" class="size-7" :aria-label="t('apps.calendar.previous')" @click="go('prev')">
        <ChevronLeft class="size-4" />
      </Button>
      <Button variant="outline" size="sm" class="h-7" @click="go('today')">{{ t('apps.calendar.today') }}</Button>
      <Button variant="outline" size="icon" class="size-7" :aria-label="t('apps.calendar.next')" @click="go('next')">
        <ChevronRight class="size-4" />
      </Button>
      <span class="ml-1 font-medium text-sm truncate" data-testid="calendar-title">{{ props.props.title ? `${props.props.title} · ${title}` : title }}</span>
      <div v-if="shownViews.length > 1" class="ml-auto inline-flex rounded-md border p-0.5" role="group">
        <button
          v-for="name in shownViews"
          :key="name"
          type="button"
          class="h-6 rounded px-2 text-xs"
          :class="view === name ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="view === name"
          @click="show(name)"
        >
          {{ t(`apps.calendar.views.${name}`) }}
        </button>
      </div>
    </div>
    <div class="flex-1 min-h-0 p-(--app-pad-tight)" :class="editable && 'pointer-events-none opacity-90'">
      <FullCalendar ref="calendar" :options="options" />
    </div>
  </div>
</template>

<style>
/* FullCalendar in the app's look (its own CSS is injected by the library). */
.app-calendar .fc {
  --fc-border-color: var(--border);
  --fc-page-bg-color: var(--background);
  --fc-neutral-bg-color: var(--muted);
  --fc-neutral-text-color: var(--muted-foreground);
  --fc-list-event-hover-bg-color: var(--accent);
  --fc-today-bg-color: color-mix(in oklab, var(--primary) 8%, transparent);
  --fc-now-indicator-color: var(--destructive);
  --fc-highlight-color: color-mix(in oklab, var(--primary) 15%, transparent);
  font-size: 12px;
}
.app-calendar .fc .fc-col-header-cell-cushion,
.app-calendar .fc .fc-daygrid-day-number,
.app-calendar .fc .fc-list-day-text,
.app-calendar .fc .fc-list-day-side-text {
  color: inherit;
  text-decoration: none;
}
.app-calendar .fc .fc-event {
  cursor: pointer;
}
</style>

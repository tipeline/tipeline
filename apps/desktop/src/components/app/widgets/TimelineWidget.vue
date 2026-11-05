<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';
import { useIcon } from '@/composables/useIcon';
import { BADGE_HEX } from '@/utils/appBadge';
import { formatValue, valueAt, type ValueFormat } from '@/utils/appFormat';
import { dayLabel, groupByDay, relativeTime, timelineItems, type TimelineItem } from '@/utils/appTimeline';
import AppBadge from '../AppBadge.vue';
import AppColorChip from './AppColorChip.vue';
import AppSkeleton from './AppSkeleton.vue';

// Rows as events on a vertical line: a record's history, an order's steps, a log. Each
// has a time, a title, a description, a dot (colored by `colorKey`, or an icon by
// `iconKey`) and optional `fields`. `sort` puts the newest or oldest first;
// `groupByDay` adds day headers (then times show as clock times). `timeFormat`
// relative ("3 hours ago", kept current) shows the exact time on hover. A click fires
// `itemClick` with `<id>.selectedItem`.
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
const { getIconComponent } = useIcon();

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const SAMPLE = [
  { title: 'Order placed', time: hoursAgo(50), status: 'done' },
  { title: 'Payment received', time: hoursAgo(49), status: 'done' },
  { title: 'Shipped', description: 'Tracking 1Z999', time: hoursAgo(3), status: 'active' },
];
const sample = computed(() => props.editable && typeof props.props.data === 'string');

const items = computed(() =>
  timelineItems(sample.value ? SAMPLE : props.props.data, {
    timeKey: props.props.timeKey,
    titleKey: props.props.titleKey,
    descriptionKey: props.props.descriptionKey,
    colorKey: sample.value ? 'status' : props.props.colorKey,
    colors: props.props.colors,
    iconKey: props.props.iconKey,
    sort: props.props.sort,
  })
);
const days = computed(() => (props.props.groupByDay ? groupByDay(items.value) : [{ day: null, items: items.value }]));

// Relative times and "Today" stay current.
const now = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => (timer = setInterval(() => (now.value = new Date()), 60_000)));
onBeforeUnmount(() => clearInterval(timer));

const timeFormat = computed<string>(() => props.props.timeFormat || (props.props.groupByDay ? 'time' : 'datetime'));
const exact = (d: Date) => d.toLocaleString(locale.value);
function when(item: TimelineItem): string {
  const d = item.time;
  if (!d) return '';
  switch (timeFormat.value) {
    case 'relative':
      return relativeTime(d, now.value, locale.value);
    case 'date':
      return d.toLocaleDateString(locale.value);
    case 'time':
      return d.toLocaleTimeString(locale.value, { hour: 'numeric', minute: '2-digit' });
    default:
      return d.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
  }
}
const header = (day: string | null) =>
  day
    ? dayLabel(day, now.value, locale.value, {
        today: t('apps.timeline.today'),
        yesterday: t('apps.timeline.yesterday'),
        tomorrow: t('apps.timeline.tomorrow'),
      })
    : t('apps.timeline.noTime');

type Field = { key: string; label?: string; format?: ValueFormat; currency?: string; colors?: Record<string, unknown> };
const fields = computed<Field[]>(() =>
  Array.isArray(props.props.fields) ? props.props.fields.filter((f: any) => f && typeof f.key === 'string') : []
);
const filled = (item: TimelineItem) =>
  fields.value
    .map((f) => ({ f, value: valueAt(item.row, f.key) }))
    .filter(({ value }) => value !== undefined && value !== null && value !== '');

function open(item: TimelineItem) {
  if (props.editable) return;
  emit('state', { selectedItem: item.row, selectedIndex: item.index });
  emit('event', 'itemClick', { selectedItem: item.row, selectedIndex: item.index });
}
const selected = (item: TimelineItem) => !props.editable && props.state?.selectedItem === item.row;
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="props.props.title" class="px-(--app-pad) pt-2.5 pb-1 text-sm font-medium truncate shrink-0">{{ props.props.title }}</div>
    <div class="flex-1 min-h-0 overflow-y-auto scroll-fade px-(--app-pad) py-2" data-testid="timeline">
      <AppSkeleton v-if="!items.length && busy && !editable" variant="list" />
      <p v-else-if="!items.length" class="m-0 py-6 text-center text-xs text-muted-foreground">
        {{ props.props.emptyText || t('apps.timeline.empty') }}
      </p>
      <section v-for="(group, g) in days" :key="group.day ?? `none-${g}`">
        <h4
          v-if="props.props.groupByDay"
          class="m-0 mb-1.5 pl-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          data-testid="timeline-day"
        >
          {{ header(group.day) }}
        </h4>
        <ol class="relative m-0 p-0 list-none">
          <li v-for="(item, i) in group.items" :key="item.key" class="relative flex gap-3" data-item>
            <!-- the line, and the event's dot or icon on it -->
            <div class="relative flex flex-col items-center shrink-0 w-5">
              <span
                v-if="item.icon && getIconComponent(item.icon)"
                class="mt-0.5 flex items-center justify-center size-5 rounded-full border bg-background"
                :style="item.color ? { color: BADGE_HEX[item.color], borderColor: BADGE_HEX[item.color] } : undefined"
              >
                <component :is="getIconComponent(item.icon)" class="size-3" />
              </span>
              <span
                v-else
                class="mt-1.5 size-2.5 rounded-full ring-4 ring-background"
                :style="{ background: item.color ? BADGE_HEX[item.color] : 'var(--muted-foreground)' }"
                :data-color="item.color ?? undefined"
              />
              <!-- the line runs on to the next event, across day headers too -->
              <span v-if="!(g === days.length - 1 && i === group.items.length - 1)" class="flex-1 w-px bg-border mt-1 -mb-1" />
            </div>
            <button
              type="button"
              :class="
                cn(
                  'flex-1 min-w-0 text-left rounded-md px-2 py-1 -mx-2 mb-2 transition-colors',
                  editable ? 'cursor-default' : 'hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  selected(item) && 'bg-accent'
                )
              "
              :aria-current="selected(item) || undefined"
              @click="open(item)"
            >
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="font-medium text-sm truncate">{{ item.title || '—' }}</span>
                <time
                  v-if="item.time"
                  class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
                  :datetime="item.time.toISOString()"
                  :title="exact(item.time)"
                  data-testid="timeline-time"
                >{{ when(item) }}</time>
              </div>
              <p v-if="item.description" class="m-0 mt-0.5 text-xs text-muted-foreground whitespace-pre-line break-words">
                {{ item.description }}
              </p>
              <dl v-if="filled(item).length" class="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <div v-for="{ f, value } in filled(item)" :key="f.key" class="flex items-center gap-1 min-w-0">
                  <dt v-if="f.label" class="m-0">{{ f.label }}</dt>
                  <dd class="m-0 min-w-0 truncate text-foreground/80">
                    <AppBadge v-if="f.format === 'badge'" :value="value" :colors="f.colors" />
                    <AppColorChip v-else-if="f.format === 'color'" :value="value" />
                    <template v-else>{{ formatValue(value, { format: f.format, currency: f.currency }, locale) }}</template>
                  </dd>
                </div>
              </dl>
            </button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

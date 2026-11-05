<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { sparkPoints, sparkValues } from '@/utils/appChart';
import { ArrowRight } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { BADGE_COLORS, type BadgeColor } from '@/utils/appBadge';
import { highlightColor } from '@/utils/appHighlight';
import AppSkeleton from './AppSkeleton.vue';

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
  /** Its `click` has actions: the card shows a link line and acts as a button. */
  clickable?: boolean;
}>();
const emit = defineEmits<{ event: [name: string] }>();
const { t, locale } = useI18n();

// Math on values that aren't loaded yet ({{ a | divided_by: b }} before the run) renders
// "NaN", and dividing by 0 "Infinity": neither is a value to show, so they count as none.
const NOT_A_NUMBER = new Set(['NaN', 'Infinity', '-Infinity']);
const current = computed(() => {
  const raw = props.props.value;
  if (typeof raw === 'number' && !Number.isFinite(raw)) return null;
  if (typeof raw === 'string' && NOT_A_NUMBER.has(raw.trim())) return null;
  return raw;
});

const value = computed(() => {
  const raw = current.value;
  if (raw == null || raw === '') return '—';
  const num = Number(raw);
  const format = props.props.format;
  if (!format || format === 'text' || Number.isNaN(num)) return String(raw);
  if (format === 'percent')
    return num.toLocaleString(locale.value, {
      style: 'percent',
      maximumFractionDigits: 2,
    });
  if (format === 'currency') {
    return num.toLocaleString(locale.value, {
      style: 'currency',
      currency: props.props.currency || 'USD',
    });
  }
  return num.toLocaleString(locale.value);
});

// The number's color: the first `colorRules` match, checked against the raw value (a
// percent KPI of 1.05 shows "105%", so "over 100%" is `operator: gt, value: 1`), else `color`.
const color = computed<BadgeColor | null>(() => {
  const raw = current.value;
  if (raw != null && raw !== '') {
    const hit = highlightColor(raw, props.props.colorRules);
    if (hit) return hit;
  }
  return (BADGE_COLORS as readonly string[]).includes(props.props.color) ? props.props.color : null;
});
// Literal classes per color, so Tailwind finds them.
const TEXT: Record<BadgeColor, string> = {
  gray: 'text-muted-foreground',
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  purple: 'text-violet-600 dark:text-violet-400',
};

// No value yet and a run on its way: its first load.
const loading = computed(
  () => !props.editable && props.busy && (current.value == null || current.value === '')
);

// In the builder a value is often still a binding — show the expression small instead
// of as a headline number.
const isBindingPreview = computed(
  () =>
    props.editable &&
    typeof props.props.value === 'string' &&
    /\{[{=%]/.test(props.props.value)
);

const trend = computed(() => {
  const raw = props.props.trend;
  const num = raw == null || raw === '' ? NaN : Number(raw);
  return Number.isNaN(num) ? null : num;
});
// A sparkline under the number: `spark` (numbers, or rows with `sparkKey`). Green when
// it ends higher than it starts, red when lower.
const spark = computed(() => sparkValues(props.props.spark, props.props.sparkKey));
const sparkLine = computed(() => sparkPoints(spark.value, 120, 32));
const sparkColor = computed(() => {
  const v = spark.value;
  if (v.length < 2 || v[v.length - 1] === v[0]) return 'var(--muted-foreground)';
  return v[v.length - 1] > v[0] ? '#10b981' : '#ef4444';
});

const linkText = computed(() => props.props.linkText || t('apps.kpi.viewDetails'));
// The builder shows the link line too, but clicking there still just selects.
const live = computed(() => !!props.clickable && !props.editable);
function onClick() {
  if (live.value) emit('event', 'click');
}

const direction = computed(
  () =>
    props.props.trendDirection ??
    (trend.value != null && trend.value < 0 ? 'down' : 'up')
);
</script>

<template>
  <AppSkeleton v-if="loading" variant="kpi" />
  <div
    v-else
    :class="
      cn(
        'flex flex-col justify-center items-center h-full p-(--app-pad) gap-1 select-none',
        live &&
          'group cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50'
      )
    "
    :role="live ? 'button' : undefined"
    :tabindex="live ? 0 : undefined"
    data-testid="kpi"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
  >
    <p class="text-xs text-muted-foreground uppercase tracking-wide m-0">
      {{ props.props.label ?? '' }}
    </p>
    <p
      v-if="isBindingPreview"
      class="text-xs font-mono text-muted-foreground m-0 max-w-full truncate"
      :title="String(props.props.value)"
    >
      {{ props.props.value }}
    </p>
    <p
      v-else
      :class="cn('text-3xl font-bold m-0', color && TEXT[color])"
      :data-color="color ?? undefined"
      data-testid="kpi-value"
    >
      {{ value }}
    </p>
    <p
      v-if="trend != null && direction !== 'neutral'"
      class="text-sm m-0"
      :class="direction === 'up' ? 'text-green-600' : 'text-red-500'"
    >
      {{ direction === 'up' ? '↑' : '↓' }} {{ Math.abs(trend) }}%
    </p>
    <svg
      v-if="sparkLine"
      viewBox="0 0 120 32"
      class="w-full max-w-40 h-8 shrink-0"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`${spark[0]} → ${spark[spark.length - 1]}`"
      data-testid="sparkline"
    >
      <polyline :points="sparkLine" fill="none" :stroke="sparkColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
    <p
      v-if="clickable"
      class="text-xs text-primary m-0 mt-0.5 inline-flex items-center gap-0.5 max-w-full group-hover:underline"
      data-testid="kpi-link"
    >
      <span class="truncate">{{ linkText }}</span>
      <ArrowRight class="size-3 shrink-0" aria-hidden="true" />
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useColorMode } from '@vueuse/core';
import { Bar, Doughnut, Line, Pie, Scatter } from 'vue-chartjs';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { funnelShare, shapeChart, shapeHeatmap, SERIES_COLORS, type ChartType } from '@/utils/appChart';
import AppSkeleton from './AppSkeleton.vue';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
);

// Chart over bound rows. One value axis (never two); a legend whenever there is more
// than one series or slice, so identity is never color alone; thin marks, rounded
// bar ends, 2px surface gaps; text in the app's text colors. Clicking a mark selects
// its row as `<chartId>.selectedPoint` and fires `pointClick`.
// hbar: bars sideways. scatter: x and y both numbers. funnel: stages as centered bars
// with their share of the first. heatmap: a grid of cells (xKey × yKey) shaded by value.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();
const { t, locale } = useI18n();
const colorMode = useColorMode();
const mode = computed<'light' | 'dark'>(() =>
  colorMode.value === 'dark' ? 'dark' : 'light'
);

const type = computed<ChartType>(() => props.props.chartType ?? 'bar');
const rows = computed<Record<string, unknown>[]>(() => {
  const data = props.props.data;
  return Array.isArray(data)
    ? data.filter((r) => r && typeof r === 'object')
    : [];
});

// Builder preview without data: a small sample so the author sees the chart's shape.
const SAMPLE = [
  { label: 'A', value: 12 },
  { label: 'B', value: 19 },
  { label: 'C', value: 8 },
  { label: 'D', value: 15 },
];
const previewing = computed(() => props.editable && rows.value.length === 0);

const shaped = computed(() =>
  previewing.value
    ? shapeChart(
        type.value,
        SAMPLE,
        'label',
        [{ key: 'value', label: t('apps.chart.sample') }],
        mode.value
      )
    : shapeChart(
        type.value,
        rows.value,
        props.props.xKey,
        props.props.series,
        mode.value,
        t('apps.chart.other')
      )
);

const isArc = computed(() => type.value === 'pie' || type.value === 'doughnut');
const sideways = computed(() => type.value === 'hbar' || type.value === 'funnel');

// ---- heat map: its own grid, not Chart.js
const HEAT_SAMPLE = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].flatMap((day, d) =>
  ['Sales', 'Support', 'Ops'].map((team, k) => ({ day, team, value: ((d + 1) * (k + 2) * 7) % 23 }))
);
function resolveValueKey(): string | undefined {
  const first = rows.value[0] ?? {};
  return Object.keys(first).find((k) => k !== props.props.xKey && k !== props.props.yKey && typeof first[k] === 'number');
}
const heat = computed(() =>
  previewing.value
    ? shapeHeatmap(HEAT_SAMPLE, 'day', 'team', 'value')
    : shapeHeatmap(rows.value, props.props.xKey, props.props.yKey, props.props.series?.[0]?.key ?? resolveValueKey())
);
function cellOf(y: string, x: string) {
  return heat.value.cells.get(`${y}\u0000${x}`);
}
// Shade: the first series color, from faint (lowest) to full (highest).
function shade(value: number) {
  const { min, max } = heat.value;
  const share = max === min ? 1 : (value - min) / (max - min);
  return `color-mix(in oklab, ${SERIES_COLORS[mode.value][0]} ${Math.round(12 + share * 88)}%, transparent)`;
}
function pickCell(y: string, x: string) {
  const cell = cellOf(y, x);
  if (cell && !props.editable) emit('event', 'pointClick', { selectedPoint: cell.row });
}

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

// A scatter's x is its own measure (days, size…): `format` is for the series' values.
const plainNumber = (value: number) => (Number.isFinite(value) ? value.toLocaleString(locale.value) : '');
function formatValue(value: number): string {
  const loc = locale.value;
  switch (props.props.format) {
    case 'currency':
      return value.toLocaleString(loc, {
        style: 'currency',
        currency: props.props.currency || 'USD',
      });
    case 'percent':
      return value.toLocaleString(loc, {
        style: 'percent',
        maximumFractionDigits: 1,
      });
    default:
      return value.toLocaleString(loc);
  }
}

const chartData = computed(() => {
  const surface = cssVar(
    '--card',
    mode.value === 'dark' ? '#1a1a19' : '#fcfcfb'
  );
  return {
    labels: shaped.value.labels,
    datasets: shaped.value.datasets.map((d, i) =>
      type.value === 'scatter'
        ? {
            label: d.label,
            data: d.points ?? [],
            backgroundColor: d.color,
            borderColor: d.color,
            pointRadius: 4,
            pointHoverRadius: 6,
            showLine: false,
          }
        : type.value === 'funnel'
        ? {
            label: d.label,
            // Floating bars centered on zero: each as wide as its value.
            data: d.data.map((v) => [-v / 2, v / 2]),
            backgroundColor: d.data.map((_, j) => `color-mix(in oklab, ${d.color} ${Math.round(100 - (j / Math.max(d.data.length, 1)) * 45)}%, transparent)`),
            borderRadius: 4,
            borderSkipped: false as const,
            barPercentage: 0.95,
            categoryPercentage: 1,
          }
        : isArc.value
        ? {
            label: d.label,
            data: d.data,
            backgroundColor: d.colors,
            borderColor: surface,
            borderWidth: 2,
            hoverOffset: 4,
          }
        : {
            label: d.label,
            data: d.data,
            backgroundColor: type.value === 'area' ? `${d.color}33` : d.color,
            borderColor: d.color,
            borderWidth: type.value === 'bar' ? 0 : 2,
            borderRadius: type.value === 'bar' ? 4 : 0,
            borderSkipped: 'start' as const,
            // Stacked areas fill down to the series below; the first fills to the axis.
            fill:
              type.value === 'area'
                ? props.props.stacked && i > 0
                  ? '-1'
                  : 'origin'
                : false,
            tension: 0.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 12,
          }
    ),
  };
});

const chartOptions = computed(() => {
  const text = cssVar(
    '--muted-foreground',
    mode.value === 'dark' ? '#c3c2b7' : '#52514e'
  );
  const grid = cssVar('--border', mode.value === 'dark' ? '#333' : '#e5e5e5');
  const multi = (shaped.value.datasets.length > 1 || isArc.value) && type.value !== 'funnel';
  const stacked = !!props.props.stacked && !isArc.value && type.value !== 'scatter' && type.value !== 'funnel';
  const funnelData = type.value === 'funnel' ? (shaped.value.datasets[0]?.data ?? []) : [];
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    indexAxis: sideways.value ? ('y' as const) : ('x' as const),
    interaction: isArc.value
      ? { mode: 'nearest' as const, intersect: true }
      : { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: multi,
        position: 'bottom' as const,
        labels: {
          color: text,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
        },
      },
      tooltip: {
        callbacks: {
          // A scatter point is headed by its name (labelKey), not its x again.
          title: (items: any[]) => {
            if (type.value !== 'scatter') return items[0]?.label ?? '';
            const row = shaped.value.rows[items[0]?.dataIndex] ?? {};
            return props.props.labelKey ? String(row[props.props.labelKey] ?? '') : '';
          },
          label: (ctx: any) => {
            if (type.value === 'funnel') {
              const v = funnelData[ctx.dataIndex] ?? 0;
              return ` ${formatValue(v)} · ${Math.round(funnelShare(funnelData, ctx.dataIndex) * 100)}%`;
            }
            if (type.value === 'scatter') {
              return ` ${ctx.dataset.label ? `${ctx.dataset.label}: ` : ''}(${plainNumber(Number(ctx.raw.x))}, ${formatValue(Number(ctx.raw.y))})`;
            }
            return ` ${ctx.dataset.label && !isArc.value ? `${ctx.dataset.label}: ` : ''}${formatValue(Number(ctx.raw))}`;
          },
        },
      },
    },
    scales: isArc.value
      ? {}
      : type.value === 'funnel'
      ? {
          // A funnel's widths are relative: no value axis.
          x: { display: false, stacked: true },
          y: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { color: text } },
        }
      : type.value === 'scatter'
      ? {
          x: { type: 'linear' as const, grid: { color: grid }, ticks: { color: text, callback: (v: any) => plainNumber(Number(v)) }, border: { color: grid } },
          y: { grid: { color: grid }, border: { display: false }, ticks: { color: text, callback: (v: any) => formatValue(Number(v)) } },
        }
      : sideways.value
      ? {
          // Values level (fewer of them rather than slanted); every category named.
          x: { stacked, beginAtZero: true, grid: { color: grid }, border: { display: false }, ticks: { color: text, maxRotation: 0, callback: (v: any) => formatValue(Number(v)) } },
          y: { stacked, grid: { display: false }, ticks: { color: text, autoSkip: false }, border: { color: grid } },
        }
      : {
          x: {
            stacked,
            grid: { display: false },
            ticks: { color: text },
            border: { color: grid },
          },
          y: {
            stacked,
            beginAtZero: true,
            grid: { color: grid },
            border: { display: false },
            ticks: {
              color: text,
              callback: (v: any) => formatValue(Number(v)),
            },
          },
        },
    datasets: { bar: { categoryPercentage: 0.8, barPercentage: 0.9 } },
    onClick: (_e: unknown, elements: Array<{ index: number }>) => {
      if (props.editable || !elements.length) return;
      const row = shaped.value.rows[elements[0].index];
      if (row) emit('event', 'pointClick', { selectedPoint: row });
    },
  };
});

const component = computed(
  () =>
    ({ bar: Bar, hbar: Bar, funnel: Bar, line: Line, area: Line, pie: Pie, doughnut: Doughnut, scatter: Scatter } as Record<string, any>)[
      type.value
    ] ?? Bar
);
</script>

<template>
  <div class="h-full flex flex-col p-(--app-pad) gap-2 min-h-0">
    <p v-if="props.props.title" class="text-sm font-medium m-0 shrink-0">
      {{ props.props.title }}
    </p>
    <!-- heat map: a grid of shaded cells -->
    <div v-if="type === 'heatmap'" class="flex-1 min-h-0 overflow-auto" :class="{ 'opacity-60': previewing }" data-testid="heatmap">
      <AppSkeleton v-if="!heat.xs.length && busy" variant="table" />
      <div v-else-if="!heat.xs.length" class="h-full flex items-center justify-center text-xs text-muted-foreground">
        {{ t('apps.chart.noData') }}
      </div>
      <table v-else class="w-full h-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th />
            <th v-for="x in heat.xs" :key="x" class="font-normal text-muted-foreground pb-1 truncate">{{ x }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="y in heat.ys" :key="y">
            <th class="font-normal text-muted-foreground text-right pr-2 whitespace-nowrap">{{ y }}</th>
            <td
              v-for="x in heat.xs"
              :key="x"
              class="rounded text-center tabular-nums min-w-8"
              :class="cellOf(y, x) && !editable ? 'cursor-pointer hover:ring-2 hover:ring-ring/40' : ''"
              :style="{ background: cellOf(y, x) ? shade(cellOf(y, x)!.value) : 'var(--muted)' }"
              :title="cellOf(y, x) ? `${y} · ${x}: ${formatValue(cellOf(y, x)!.value)}` : `${y} · ${x}`"
              :data-cell="`${y}|${x}`"
              @click="pickCell(y, x)"
            >
              {{ cellOf(y, x) ? formatValue(cellOf(y, x)!.value) : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <AppSkeleton v-else-if="busy && !shaped.labels.length" variant="chart" class="flex-1" />
    <div
      v-else-if="!shaped.datasets.length || !shaped.labels.length"
      class="flex-1 flex items-center justify-center text-xs text-muted-foreground"
    >
      {{ t('apps.chart.noData') }}
    </div>
    <div
      v-else
      class="relative flex-1 min-h-0"
      :class="{ 'opacity-60': previewing }"
    >
      <component
        :is="component"
        :data="chartData as any"
        :options="chartOptions as any"
      />
    </div>
  </div>
</template>

// Turns app chart props + rows into Chart.js data. Kept free of Chart.js and the DOM
// so the shaping rules are testable on their own.

/**
 * Categorical slots in fixed order (validated: CVD-separated adjacent pairs, both
 * modes). Never cycled — past eight, slices fold into "Other".
 */
export const SERIES_COLORS = {
  light: [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#4a3aa7',
    '#e34948',
  ],
  dark: [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
  ],
};
export const OTHER_COLOR = { light: '#8a8984', dark: '#7c7b76' };
export const MAX_SLICES = 8;

export type ChartType = 'bar' | 'hbar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'funnel' | 'heatmap';
export interface ChartSeries {
  key: string;
  label?: string;
}

export interface ShapedChart {
  labels: string[];
  datasets: Array<{
    key: string;
    label: string;
    data: number[];
    color: string;
    colors?: string[];
    /** Scatter: the points ({ x, y } from each row). */
    points?: Array<{ x: number; y: number }>;
  }>;
  /** Source row behind each label (null for the folded "Other" slice). */
  rows: Array<Record<string, unknown> | null>;
}

const toNumber = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Series to plot: the configured ones, else every numeric key of the first row except the x key. */
export function resolveSeries(
  rows: Record<string, unknown>[],
  xKey: string | undefined,
  series?: ChartSeries[]
): ChartSeries[] {
  if (series?.length) return series;
  const first = rows[0] ?? {};
  return Object.keys(first)
    .filter((k) => k !== xKey && typeof first[k] === 'number')
    .map((key) => ({ key }));
}

export function shapeChart(
  type: ChartType,
  rows: Record<string, unknown>[],
  xKey: string | undefined,
  series: ChartSeries[] | undefined,
  mode: 'light' | 'dark',
  otherLabel = 'Other'
): ShapedChart {
  const palette = SERIES_COLORS[mode];
  const resolved = resolveSeries(rows, xKey, series);
  const label = (row: Record<string, unknown>, i: number) =>
    String(xKey ? (row[xKey] ?? '') : i + 1);

  // Scatter: x and y are both numbers from the row — one dataset per series (its y).
  if (type === 'scatter') {
    const usable = rows.filter((r) => xKey && Number.isFinite(Number(r[xKey])));
    return {
      labels: usable.map(label),
      datasets: resolved.slice(0, palette.length).map((s, i) => ({
        key: s.key,
        label: s.label ?? s.key,
        data: usable.map((r) => toNumber(r[s.key])),
        points: usable.map((r) => ({ x: toNumber(r[xKey!]), y: toNumber(r[s.key]) })),
        color: palette[i],
      })),
      rows: usable,
    };
  }

  // Funnel: one series, one bar per stage in the order given (never folded or sorted:
  // the order is the process).
  if (type === 'funnel') {
    const s = resolved[0];
    if (!s) return { labels: [], datasets: [], rows: [] };
    return {
      labels: rows.map(label),
      datasets: [{ key: s.key, label: s.label ?? s.key, data: rows.map((r) => toNumber(r[s.key])), color: palette[0] }],
      rows,
    };
  }

  if (type === 'pie' || type === 'doughnut') {
    const s = resolved[0];
    if (!s) return { labels: [], datasets: [], rows: [] };
    const keep =
      rows.length > MAX_SLICES ? rows.slice(0, MAX_SLICES - 1) : rows;
    const rest = rows.length > MAX_SLICES ? rows.slice(MAX_SLICES - 1) : [];
    const labels = keep.map(label);
    const data = keep.map((r) => toNumber(r[s.key]));
    const colors = keep.map((_, i) => palette[i]);
    if (rest.length) {
      labels.push(otherLabel);
      data.push(rest.reduce((sum, r) => sum + toNumber(r[s.key]), 0));
      colors.push(OTHER_COLOR[mode]);
    }
    return {
      labels,
      datasets: [
        {
          key: s.key,
          label: s.label ?? s.key,
          data,
          color: palette[0],
          colors,
        },
      ],
      rows: [...keep, ...(rest.length ? [null] : [])],
    };
  }

  // Bar (either way) / line / area: one dataset per series, colored by its position in the list
  // (never by rank), so filtering rows never repaints a series. Past eight series the
  // rest are dropped rather than given an invented color.
  return {
    labels: rows.map(label),
    datasets: resolved.slice(0, palette.length).map((s, i) => ({
      key: s.key,
      label: s.label ?? s.key,
      data: rows.map((r) => toNumber(r[s.key])),
      color: palette[i],
    })),
    rows,
  };
}

/** A funnel stage's share of the first stage (0–1; 0 when the first is 0). */
export const funnelShare = (data: number[], i: number) => (data[0] ? data[i] / data[0] : 0);

export interface Heatmap {
  /** Column names (the x key's values) and row names (the y key's), first-seen order. */
  xs: string[];
  ys: string[];
  /** `${y}\u0000${x}` → the cell's value and the row behind it (several rows add up). */
  cells: Map<string, { value: number; row: Record<string, unknown> }>;
  min: number;
  max: number;
}

/**
 * A heat map: one cell per (y, x) pair, its value from `valueKey`; rows sharing a cell
 * add up. Rows without both names are left out.
 */
export function shapeHeatmap(
  rows: Record<string, unknown>[],
  xKey: string | undefined,
  yKey: string | undefined,
  valueKey: string | undefined
): Heatmap {
  const xs: string[] = [];
  const ys: string[] = [];
  const cells: Heatmap['cells'] = new Map();
  if (!xKey || !yKey) return { xs, ys, cells, min: 0, max: 0 };
  for (const row of rows) {
    const x = row[xKey];
    const y = row[yKey];
    if (x === undefined || x === null || x === '' || y === undefined || y === null || y === '') continue;
    const xs_ = String(x);
    const ys_ = String(y);
    if (!xs.includes(xs_)) xs.push(xs_);
    if (!ys.includes(ys_)) ys.push(ys_);
    const key = `${ys_}\u0000${xs_}`;
    const add = valueKey ? toNumber(row[valueKey]) : 1;
    const cell = cells.get(key);
    cells.set(key, cell ? { value: cell.value + add, row: cell.row } : { value: add, row });
  }
  const values = [...cells.values()].map((c) => c.value);
  return { xs, ys, cells, min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 };
}

/**
 * A sparkline's numbers: a list of numbers, or rows and the key holding the number.
 * Anything not a number is skipped.
 */
export function sparkValues(data: unknown, key?: string): number[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((v) => (key && v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : v))
    .map((v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN))
    .filter((n) => Number.isFinite(n));
}

/** SVG points for a sparkline in a width × height box (a flat line when all are equal). */
export function sparkPoints(values: number[], width: number, height: number, pad = 2): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (width - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const y = max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2);
      return `${(pad + i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

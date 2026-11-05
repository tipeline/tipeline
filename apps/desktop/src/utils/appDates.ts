// Calendar days for app components and history filters. A day is "YYYY-MM-DD" in the
// user's local timezone — the same rule appFormat uses to show dates.

export interface DayRange {
  from: string;
  to: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDay = (value: unknown): value is string => typeof value === 'string' && DAY.test(value);

/** A local date as "YYYY-MM-DD". */
export function toDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" as a local Date at midnight. */
export function fromDay(day: string): Date {
  const [, y, m, d] = day.match(DAY)!;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/** The first and last instant of a local day, as ISO strings. */
export const dayStart = (day: string) => fromDay(day).toISOString();
export function dayEnd(day: string): string {
  const end = fromDay(day);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last7Days',
  'last30Days',
  'thisMonth',
  'lastMonth',
  'thisYear',
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

/** The days a preset covers, counted from `today`. */
export function presetRange(preset: DateRangePreset, today = new Date()): DayRange {
  const day = (offset: number) => toDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case 'today':
      return { from: day(0), to: day(0) };
    case 'yesterday':
      return { from: day(-1), to: day(-1) };
    case 'last7Days':
      return { from: day(-6), to: day(0) };
    case 'last30Days':
      return { from: day(-29), to: day(0) };
    case 'thisMonth':
      return { from: toDay(new Date(y, m, 1)), to: toDay(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: toDay(new Date(y, m - 1, 1)), to: toDay(new Date(y, m, 0)) };
    case 'thisYear':
      return { from: toDay(new Date(y, 0, 1)), to: toDay(new Date(y, 11, 31)) };
  }
}

/**
 * A date range value from what an app gives it: a preset name, or { from, to } with
 * days in either order. Anything else is no range (null).
 */
export function toDayRange(value: unknown, today = new Date()): DayRange | null {
  if (typeof value === 'string' && (DATE_RANGE_PRESETS as readonly string[]).includes(value)) {
    return presetRange(value as DateRangePreset, today);
  }
  if (!value || typeof value !== 'object') return null;
  const { from, to } = value as Record<string, unknown>;
  if (!isDay(from) || !isDay(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * A history runnable's filter, resolved, as core takes it: a day becomes its first
 * (from) or last (to) local instant, so "to" includes its whole day. Empty values are
 * sent as such (they clear the saved filter: an open range).
 */
export function historyFilterValues(filter: {
  dateFrom?: unknown;
  dateTo?: unknown;
  count?: unknown;
  pipelineIdentifier?: unknown;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const instant = (value: unknown, end: boolean) => {
    if (value instanceof Date) return value.toISOString();
    if (isDay(value)) return end ? dayEnd(value) : dayStart(value);
    return typeof value === 'string' ? value : '';
  };
  if ('dateFrom' in filter) out.dateFrom = instant(filter.dateFrom, false);
  if ('dateTo' in filter) out.dateTo = instant(filter.dateTo, true);
  if ('count' in filter) out.count = filter.count;
  if ('pipelineIdentifier' in filter) out.pipelineIdentifier = filter.pipelineIdentifier ?? '';
  return out;
}

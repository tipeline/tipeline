import { badgeColor, type BadgeColor } from './appBadge';
import { valueAt } from './appFormat';

// A timeline's events: one per row, at the time its `timeKey` holds. Without keys the
// usual names are tried (time / date / at / timestamp / createdAt, title / name /
// event / label, description / detail / message / note). `sort` puts the newest or
// the oldest first (default: as given); `groupByDay` splits them under day headers.

export interface TimelineItem {
  key: string;
  row: Record<string, unknown>;
  /** Position in `data`. */
  index: number;
  time: Date | null;
  title: string;
  description: string;
  color: BadgeColor | null;
  icon: string | null;
}

export interface TimelineOptions {
  timeKey?: string;
  titleKey?: string;
  descriptionKey?: string;
  colorKey?: string;
  colors?: Record<string, unknown> | null;
  iconKey?: string;
  sort?: 'newest' | 'oldest' | 'none';
}

export interface TimelineDay {
  /** "YYYY-MM-DD" (local), or null for events without a time. */
  day: string | null;
  items: TimelineItem[];
}

const TIME_KEYS = ['time', 'date', 'at', 'timestamp', 'createdat', 'created_at', 'when'];
const TITLE_KEYS = ['title', 'name', 'event', 'label', 'action'];
const DESCRIPTION_KEYS = ['description', 'detail', 'details', 'message', 'note', 'text'];

function pick(row: Record<string, unknown>, key: string | undefined, fallbacks: string[]): unknown {
  if (key) return valueAt(row, key);
  for (const name of fallbacks) {
    const hit = Object.keys(row).find((k) => k.toLowerCase() === name);
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

/** A Date for an ISO text, a date-only text (that day, here) or epoch milliseconds. */
export function toTime(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  const text = String(value).trim();
  const day = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function timelineItems(data: unknown, options: TimelineOptions = {}): TimelineItem[] {
  const rows = (Array.isArray(data) ? data : []).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  const items = rows.map((row, index) => {
    const icon = options.iconKey ? valueAt(row, options.iconKey) : undefined;
    return {
      key: text(row.id ?? `#${index}`),
      row,
      index,
      time: toTime(pick(row, options.timeKey, TIME_KEYS)),
      title: text(pick(row, options.titleKey, TITLE_KEYS)),
      description: text(pick(row, options.descriptionKey, DESCRIPTION_KEYS)),
      color: options.colorKey ? badgeColor(valueAt(row, options.colorKey), options.colors) : null,
      icon: typeof icon === 'string' && icon.trim() ? icon.trim() : null,
    };
  });
  if (options.sort === 'newest' || options.sort === 'oldest') {
    const sign = options.sort === 'newest' ? -1 : 1;
    // Events without a time keep their order, after the timed ones; ties keep theirs.
    items.sort((a, b) => {
      if (!a.time || !b.time) return a.time ? -1 : b.time ? 1 : a.index - b.index;
      return sign * (a.time.getTime() - b.time.getTime()) || a.index - b.index;
    });
  }
  return items;
}

const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Consecutive events of the same day under one header (in the order given). */
export function groupByDay(items: TimelineItem[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  for (const item of items) {
    const day = item.time ? dayOf(item.time) : null;
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days;
}

/** "Today", "Yesterday" (or "Tomorrow"), else the date in words. */
export function dayLabel(day: string, now: Date, locale: string, words: { today: string; yesterday: string; tomorrow: string }): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return words.today;
  if (diff === 1) return words.yesterday;
  if (diff === -1) return words.tomorrow;
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "3 hours ago", "in 2 days" — the largest unit that fits. */
export function relativeTime(time: Date, now: Date, locale: string): string {
  const seconds = Math.round((time.getTime() - now.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(0, 'second');
}

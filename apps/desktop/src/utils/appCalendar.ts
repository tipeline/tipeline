import { badgeColor, BADGE_HEX, isHexColor, mappedColor, textOn, type BadgeColor } from './appBadge';
import { valueAt } from './appFormat';

// A calendar component's events: one per row with a usable start. A date alone
// ("2026-10-08") is an all-day event; a date and time is placed at its hour. Keys may
// be paths; without them the usual names are tried. Colors follow badges' rules, and
// a hex color ("#039be5") is used as is — in `colors`, in `defaultColor`, or as the
// colorKey's value itself (e.g. each Google calendar's own color).

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  /** A badge color name, or the hex color it was given. */
  color: BadgeColor | string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: { row: Record<string, unknown>; index: number };
}

export interface EventOptions {
  titleKey?: string;
  startKey?: string;
  endKey?: string;
  colorKey?: string;
  colors?: Record<string, unknown> | null;
  defaultColor?: unknown;
}

const TITLE_KEYS = ['title', 'name', 'label', 'summary'];
const START_KEYS = ['start', 'date', 'startat', 'start_at', 'starts', 'when', 'day'];
const END_KEYS = ['end', 'endat', 'end_at', 'ends', 'until'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function find(row: Record<string, unknown>, key: string | undefined, fallbacks: string[]): unknown {
  if (key) return valueAt(row, key);
  for (const k of fallbacks) {
    const hit = Object.keys(row).find((name) => name.toLowerCase() === k);
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

/** A date / date-time as the calendar takes it, or null if it isn't one. */
function when(value: unknown): { text: string; allDay: boolean } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { text: value.toISOString(), allDay: false };
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (DAY.test(text)) return { text, allDay: true };
  return Number.isNaN(Date.parse(text)) ? null : { text, allDay: false };
}

/** A hex color the row asks for (through `colors`, its own value or `defaultColor`), else a badge color. */
function eventColor(row: Record<string, unknown>, options: EventOptions): BadgeColor | string {
  if (!options.colorKey) {
    return isHexColor(options.defaultColor) ? options.defaultColor : badgeColor('', null, options.defaultColor ?? 'blue');
  }
  const value = valueAt(row, options.colorKey);
  const mapped = mappedColor(value, options.colors);
  if (isHexColor(mapped)) return mapped;
  if (mapped === undefined || mapped === null) {
    if (isHexColor(value)) return value;
    if (isHexColor(options.defaultColor)) return options.defaultColor;
  }
  return badgeColor(value, options.colors, options.defaultColor);
}

export function eventsFrom(data: unknown, options: EventOptions = {}): CalendarEvent[] {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  const events: CalendarEvent[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    const start = when(find(r, options.startKey, START_KEYS));
    if (!start) return;
    const end = when(find(r, options.endKey, END_KEYS));
    const title = find(r, options.titleKey, TITLE_KEYS);
    const color = eventColor(r, options);
    const hex = isHexColor(color) ? color.trim() : BADGE_HEX[color as BadgeColor];
    events.push({
      id: String(r.id ?? index),
      title: title === undefined || title === null ? '' : String(title),
      start: start.text,
      ...(end ? { end: end.text } : {}),
      allDay: start.allDay && (!end || end.allDay),
      color,
      backgroundColor: hex,
      borderColor: hex,
      textColor: textOn(hex),
      extendedProps: { row: r, index },
    });
  });
  return events;
}

/** "YYYY-MM-DD" for a Date, in local time (what a date range's from / to hold). */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

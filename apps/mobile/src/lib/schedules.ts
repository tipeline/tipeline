import { describeCron, describeInterval, parseSchedule, type ScheduleErrorCode } from '@tipeline/utils';
import type { ScheduleItem } from './inbox';

type Timing = Pick<ScheduleItem, 'cron' | 'runAt' | 'everySeconds'>;

/** A date and time in the phone's language and time zone: "Fri 13 Nov, 15:00". */
export function formatDateTime(iso: string | Date | null | undefined, locale: string): string {
  const at = iso instanceof Date ? iso : iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

export const phoneZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * "At 09:00, Monday through Friday", "Every 40 seconds" — or null for a one-time schedule.
 * A cron's times are the server's: when its zone isn't the phone's, it is named,
 * "At 09:00, Monday through Friday (UTC)".
 */
export function repeatText(timing: Timing & { timezone?: string }, locale: string, here = phoneZone()): string | null {
  const lang = locale.split('-')[0];
  if (timing.cron) {
    const text = describeCron(timing.cron, lang);
    return timing.timezone && timing.timezone !== here ? `${text} (${timing.timezone})` : text;
  }
  if (timing.everySeconds) return describeInterval(timing.everySeconds, lang);
  return null;
}

/** A one-time schedule that already ran is done, not paused. */
export function scheduleState(s: Pick<ScheduleItem, 'enabled' | 'runAt' | 'lastRunAt'>): 'active' | 'paused' | 'done' {
  if (s.enabled) return 'active';
  return s.runAt && s.lastRunAt ? 'done' : 'paused';
}

/** The schedule that runs next, if any is on. */
export function nextUp(schedules: ScheduleItem[]): ScheduleItem | null {
  return (
    schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0] ?? null
  );
}

/** What `scheduleSet` gets: exactly one of these, like Desktop sends after its preview. */
export type ScheduleTiming = { cron: string } | { everySeconds: number } | { runAt: string };

export type WhenPreview =
  | { ok: true; kind: 'repeat'; text: string; timing: ScheduleTiming }
  | { ok: true; kind: 'once'; at: Date; timing: ScheduleTiming }
  | { ok: false; error: ScheduleErrorCode; message: string };

/**
 * What the words typed for a new schedule mean, read on the phone with the parser Core
 * uses. "Tomorrow at 8" is the person's own 8 o'clock, so a one-time schedule is sent as
 * the exact time it names.
 */
export function previewWhen(text: string, locale: string, now = new Date()): WhenPreview {
  const parsed = parseSchedule(text, now);
  if (!parsed.ok) return parsed;
  const lang = locale.split('-')[0];
  if (parsed.kind === 'once') return { ok: true, kind: 'once', at: parsed.runAt, timing: { runAt: parsed.runAt.toISOString() } };
  if (parsed.kind === 'cron') return { ok: true, kind: 'repeat', text: describeCron(parsed.cron, lang), timing: { cron: parsed.cron } };
  return { ok: true, kind: 'repeat', text: describeInterval(parsed.seconds, lang), timing: { everySeconds: parsed.seconds } };
}

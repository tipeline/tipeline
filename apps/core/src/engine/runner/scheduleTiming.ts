import { MIN_SCHEDULE_INTERVAL_SECONDS, checkCron, nextIntervalRuns, parseSchedule } from '@tipeline/utils';
import { nextRunAt } from '@engine/runner/nextRunAt.js';
import type { ScheduleEntry } from '@engine/runner/IJobRunner.js';
import type { Schedule } from '@database/models/Schedule.js';

/** What a client may send for a schedule's timing: plain words, a cron, an interval, or a time to run once. */
export interface ScheduleTimingInput {
  /** Plain words or a cron, e.g. "every weekday at 9am" or "tomorrow at 8" (see parseSchedule). */
  when?: string | null;
  cron?: string | null;
  runAt?: string | null;
  everySeconds?: number | null;
}

export type ScheduleTiming = { cron: string | null; runAt: string | null; everySeconds: number | null };

/**
 * Turns what a client sent into exactly one of cron / runAt / everySeconds, checked the
 * same way the Desktop preview checks it. Throws with a message a person can act on.
 */
export function resolveScheduleTiming(input: ScheduleTimingInput, now: Date = new Date()): ScheduleTiming {
  const given = [input.when, input.cron, input.runAt, input.everySeconds].filter(
    (v) => v != null && String(v).trim() !== ''
  );
  if (given.length !== 1) {
    throw new Error('A schedule needs exactly one of: when (plain words or cron), cron, everySeconds, or runAt.');
  }
  const none = { cron: null, runAt: null, everySeconds: null };
  if (input.when != null && String(input.when).trim()) {
    const parsed = parseSchedule(String(input.when), now);
    if (!parsed.ok) throw new Error(parsed.message);
    if (parsed.kind === 'cron') return { ...none, cron: parsed.cron };
    if (parsed.kind === 'interval') return { ...none, everySeconds: parsed.seconds };
    return { ...none, runAt: parsed.runAt.toISOString() };
  }
  if (input.cron != null && String(input.cron).trim()) {
    const cron = String(input.cron).trim().split(/\s+/).join(' ');
    const check = checkCron(cron, now);
    if (!check.ok) throw new Error(check.message);
    return { ...none, cron };
  }
  if (input.everySeconds != null && String(input.everySeconds).trim() !== '') {
    const seconds = Number(input.everySeconds);
    if (!Number.isInteger(seconds) || seconds <= 0) throw new Error(`"${input.everySeconds}" is not a number of seconds.`);
    if (seconds < MIN_SCHEDULE_INTERVAL_SECONDS) {
      throw new Error(`Schedules can run at most every ${MIN_SCHEDULE_INTERVAL_SECONDS} seconds.`);
    }
    return { ...none, everySeconds: seconds };
  }
  const runAt = new Date(String(input.runAt));
  if (Number.isNaN(runAt.getTime())) throw new Error(`"${input.runAt}" is not a date and time.`);
  if (runAt.getTime() <= now.getTime()) throw new Error('That time has already passed.');
  return { ...none, runAt: runAt.toISOString() };
}

/** A time from the database. SQLite's CURRENT_TIMESTAMP is UTC without a zone, which Date would read as local. */
function dbTime(value: unknown): Date | null {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A one-time schedule that already started its run. */
export function isDoneOnce(schedule: Pick<Schedule, 'run_at' | 'last_run_at'>): boolean {
  return !!schedule.run_at && !!schedule.last_run_at;
}

/**
 * Refuses to turn on a one-time schedule whose time has gone by: it would run at once,
 * which is rarely what someone flipping a switch on an old schedule expects.
 */
export function assertCanEnable(schedule: Pick<Schedule, 'run_at' | 'last_run_at'>, now: Date = new Date()) {
  if (!schedule.run_at) return;
  if (isDoneOnce(schedule) || new Date(schedule.run_at).getTime() <= now.getTime()) {
    throw new Error('This one-time schedule has already run or its time has passed. Edit it to pick a new time.');
  }
}

/**
 * When a one-time schedule's job should fire. A time missed while Core was off still
 * runs, a second after start-up, the way a missed `anacron` job does.
 */
export function onceFireDate(runAt: string, now: Date = new Date()): Date {
  return new Date(Math.max(new Date(runAt).getTime(), now.getTime() + 1000));
}

export function parseScheduleVariables(raw: string | null | undefined): Record<string, any> {
  try {
    return JSON.parse(raw ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/**
 * The next run of an interval schedule, counted from its last run (or from when it was last
 * saved or turned on). After a Core restart the runner starts counting again, so this can be
 * off by up to one interval until the first run there.
 */
function intervalNextRun(s: Schedule, from: Date): string {
  const since = dbTime(s.last_run_at) ?? dbTime(s.updated_at) ?? dbTime(s.created_at);
  const start = since ?? from;
  return nextIntervalRuns(s.every_seconds!, 1, start, from)[0].toISOString();
}

export function toScheduleEntry(s: Schedule, from: Date = new Date()): ScheduleEntry {
  const runAt = iso(s.run_at);
  return {
    scheduleIdentifier: s.identifier,
    taskIdentifier: s.task?.identifier ?? 'unknown',
    taskName: s.task?.name ?? 'unknown',
    cron: s.cron ?? null,
    runAt,
    everySeconds: s.every_seconds ?? null,
    variables: parseScheduleVariables(s.variables),
    enabled: !!s.enabled,
    nextRunAt: s.cron
      ? nextRunAt(s.cron, !!s.enabled, from)
      : s.every_seconds
        ? s.enabled
          ? intervalNextRun(s, from)
          : null
        : s.enabled && runAt && !isDoneOnce(s)
          ? onceFireDate(runAt, from).toISOString()
          : null,
    lastRunAt: iso(s.last_run_at),
  };
}

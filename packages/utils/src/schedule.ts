import * as chrono from 'chrono-node';
import cronParser from 'cron-parser';
import cronstrue from 'cronstrue/i18n.js';

/**
 * Schedules: what people type ("every weekday at 9am", "tomorrow at 8", a cron
 * expression) turned into what the scheduler runs — a 5- or 6-field cron (the
 * optional first field is seconds) or one date to run once. Shared by Desktop (live
 * preview), the CLI and Core (which checks again before saving), so all three
 * read the same words the same way. Times are the machine's local time, like the
 * scheduler's.
 */

/** Runs closer together than this are refused: each run starts a worker and fills run history. */
export const MIN_SCHEDULE_INTERVAL_SECONDS = 10;
/** The time used when the words name a day but no time ("tomorrow", "every monday"). */
const DEFAULT_HOUR = 9;

export type ScheduleErrorCode =
  | 'empty'
  | 'unrecognized'
  | 'invalidCron'
  | 'tooFrequent'
  | 'uneven'
  | 'mixedTimes'
  | 'inPast';

export type ScheduleError = { ok: false; error: ScheduleErrorCode; message: string };
export type ParsedSchedule =
  | { ok: true; kind: 'cron'; cron: string }
  | { ok: true; kind: 'once'; runAt: Date }
  /** Repeats every N seconds from when it's turned on: for intervals a cron can't keep even ("every 40 seconds"). */
  | { ok: true; kind: 'interval'; seconds: number }
  | ScheduleError;

function fail(error: ScheduleErrorCode, message: string): ScheduleError {
  return { ok: false, error, message };
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

const CRON_NAMES = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)\b/gi;
const CRON_FIELD = /^[\d*?/,\-#LW]+$/i;

/** True when the text is shaped like a 5- or 6-field cron expression (not checked further). */
export function isCronExpression(text: string): boolean {
  const fields = text.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return false;
  return fields.every((f) => CRON_FIELD.test(f.replace(CRON_NAMES, '0')));
}

/** A 6-field cron: the first field is seconds. */
export function cronHasSeconds(cron: string): boolean {
  return cron.trim().split(/\s+/).length === 6;
}

/** The next `count` times a cron fires after `from`. Empty when it can't be read. */
export function nextCronRuns(cron: string, count = 3, from: Date = new Date()): Date[] {
  try {
    const it = cronParser.parseExpression(cron.trim(), { currentDate: from });
    const runs: Date[] = [];
    for (let i = 0; i < count; i++) runs.push(it.next().toDate());
    return runs;
  } catch {
    return [];
  }
}

/** Checks a cron expression: 5 or 6 fields, readable, and no closer than the minimum interval. */
export function checkCron(cron: string, from: Date = new Date()): { ok: true } | ScheduleError {
  const text = cron.trim();
  if (!isCronExpression(text)) {
    return fail('invalidCron', 'A cron expression has 5 fields, or 6 with seconds first (e.g. "0 9 * * 1-5").');
  }
  // Enough runs to see the closest pair of any pattern that repeats within a minute.
  const runs = nextCronRuns(text, 40, from);
  if (runs.length === 0) return fail('invalidCron', `"${text}" is not a valid cron expression.`);
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].getTime() - runs[i - 1].getTime() < MIN_SCHEDULE_INTERVAL_SECONDS * 1000) {
      return fail('tooFrequent', `Schedules can run at most every ${MIN_SCHEDULE_INTERVAL_SECONDS} seconds.`);
    }
  }
  return { ok: true };
}

const INTERVAL_WORDS: Record<string, Record<'second' | 'minute' | 'hour' | 'day', [string, string]> & { every: string }> = {
  en: { every: 'Every', second: ['second', 'seconds'], minute: ['minute', 'minutes'], hour: ['hour', 'hours'], day: ['day', 'days'] },
  es: { every: 'Cada', second: ['segundo', 'segundos'], minute: ['minuto', 'minutos'], hour: ['hora', 'horas'], day: ['día', 'días'] },
};

/** An interval in words: "Every 40 seconds", "Every 90 minutes", "Cada 2 días". */
export function describeInterval(seconds: number, locale = 'en'): string {
  const words = INTERVAL_WORDS[locale] ?? INTERVAL_WORDS.en;
  const [n, unit] =
    seconds % 86400 === 0
      ? [seconds / 86400, 'day' as const]
      : seconds % 3600 === 0
        ? [seconds / 3600, 'hour' as const]
        : seconds % 60 === 0
          ? [seconds / 60, 'minute' as const]
          : [seconds, 'second' as const];
  return `${words.every} ${n} ${words[unit][n === 1 ? 0 : 1]}`;
}

/** The next `count` runs of an interval schedule that started counting at `since`. */
export function nextIntervalRuns(seconds: number, count = 3, since: Date = new Date(), from: Date = new Date()): Date[] {
  const step = seconds * 1000;
  let next = since.getTime() + step;
  if (next <= from.getTime()) next += Math.ceil((from.getTime() - next) / step) * step;
  if (next <= from.getTime()) next += step;
  return Array.from({ length: count }, (_, i) => new Date(next + i * step));
}

/** A cron in words, e.g. "At 09:00, Monday through Friday". Falls back to the cron itself. */
export function describeCron(cron: string, locale = 'en'): string {
  try {
    return cronstrue.toString(cron.trim(), {
      locale,
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch {
    return cron;
  }
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

// Spanish phrasing mapped onto the English words the parser reads. Longest first,
// matched on whole words after accents are stripped.
const SPANISH: Array<[string, string]> = [
  ['de lunes a viernes', 'weekdays'],
  ['entre semana', 'weekdays'],
  ['dias laborables', 'weekdays'],
  ['dias habiles', 'weekdays'],
  ['fines de semana', 'weekends'],
  ['fin de semana', 'weekends'],
  ['todos los dias', 'daily'],
  ['cada dia', 'daily'],
  ['diariamente', 'daily'],
  ['diario', 'daily'],
  ['todas las semanas', 'weekly'],
  ['cada semana', 'weekly'],
  ['semanalmente', 'weekly'],
  ['todos los meses', 'monthly'],
  ['cada mes', 'monthly'],
  ['mensualmente', 'monthly'],
  ['cada hora', 'hourly'],
  ['cada media hora', 'every 30 minutes'],
  ['a mediodia', 'at noon'],
  ['a medianoche', 'at midnight'],
  ['de la manana', 'am'],
  ['de la tarde', 'pm'],
  ['de la noche', 'pm'],
  ['en punto', ''],
  ['del mes', 'of the month'],
  ['el dia', 'on the'],
  ['los dias', 'on the'],
  ['todos los', 'every'],
  ['todas las', 'every'],
  ['a las', 'at'],
  ['a la', 'at'],
  ['cada', 'every'],
  ['los', 'every'],
  ['segundos', 'seconds'],
  ['segundo', 'second'],
  ['minutos', 'minutes'],
  ['minuto', 'minute'],
  ['horas', 'hours'],
  ['hora', 'hour'],
  ['entre', 'between'],
  ['desde', 'from'],
  ['hasta', 'to'],
  ['lunes', 'monday'],
  ['martes', 'tuesday'],
  ['miercoles', 'wednesday'],
  ['jueves', 'thursday'],
  ['viernes', 'friday'],
  ['sabados', 'saturday'],
  ['sabado', 'saturday'],
  ['domingos', 'sunday'],
  ['domingo', 'sunday'],
  ['mediodia', 'noon'],
  ['medianoche', 'midnight'],
  ['dias', 'days'],
  ['y', 'and'],
  ['de', ''],
];

function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [from, to] of SPANISH) {
    s = s.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return s.replace(/\s+/g, ' ').trim();
}

const DAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};
const DAY_WORD = `(?:${Object.keys(DAYS).sort((a, b) => b.length - a.length).join('|')})s?`;
const RECURRING_WORD = new RegExp(
  `\\b(every|each|daily|weekly|monthly|hourly|weekdays?|weekends?|${Object.keys(DAYS)
    .filter((d) => d.length > 4)
    .map((d) => `${d}s`)
    .join('|')})\\b`
);
// Words that carry no meaning of their own once the rest is read.
const FILLER = /\b(every|each|at|on|the|and|of|month|day|days|run|it|starting|from|o'?clock)\b|,/g;

function dayNumber(word: string): number {
  return DAYS[word.replace(/s$/, '')] ?? DAYS[word];
}

type Time = { hour: number; minute: number };

function toTime(h: string, m: string | undefined, meridiem: string | undefined): Time | null {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem.startsWith('p') && hour !== 12) hour += 12;
    if (meridiem.startsWith('a') && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.?|p\.m\.?)?(?![\w:])/g;

/** Reads an interval like "every 20 seconds" into seconds, removing it from the text. */
function takeInterval(s: string): { seconds: number | null; rest: string } {
  const units: Record<string, number> = {
    s: 1, sec: 1, second: 1,
    m: 60, min: 60, minute: 60,
    h: 3600, hr: 3600, hour: 3600,
    d: 86400, day: 86400,
  };
  const unit = '(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)';
  let m = s.match(new RegExp(`\\bevery\\s+(\\d+)\\s*${unit}\\b`));
  if (m) {
    const key = m[2].replace(/s$/, '') || m[2];
    return { seconds: Number(m[1]) * (units[key] ?? units[m[2]]), rest: s.replace(m[0], ' ') };
  }
  m = s.match(/\bevery\s+half\s+(?:an\s+)?hour\b/);
  if (m) return { seconds: 1800, rest: s.replace(m[0], ' ') };
  m = s.match(/\bevery\s+(second|minute|hour)\b/);
  if (m) return { seconds: units[m[1]], rest: s.replace(m[0], ' ') };
  m = s.match(/\bhourly\b/);
  if (m) return { seconds: 3600, rest: s.replace(m[0], ' ') };
  return { seconds: null, rest: s };
}

/** True when a cron can repeat this many seconds evenly (divides a minute, an hour or a day). */
function fitsCron(secs: number): boolean {
  if (secs < 60) return 60 % secs === 0;
  if (secs < 3600) return secs % 60 === 0 && 60 % (secs / 60) === 0;
  return secs % 3600 === 0 && secs / 3600 <= 24 && 24 % (secs / 3600) === 0;
}

function parseRecurring(text: string): ParsedSchedule {
  let s = ` ${text} `;

  const interval = takeInterval(s);
  s = interval.rest;

  // An hour window for intervals: "between 9 and 17", "from 9am to 5pm".
  let window: { from: number; to: number } | null = null;
  const win = s.match(
    /\b(?:between|from)\s+(\d{1,2})(?::00)?\s*(am|pm)?\s+(?:and|to|until|-)\s+(\d{1,2})(?::00)?\s*(am|pm)?/
  );
  if (win) {
    const from = toTime(win[1], undefined, win[2]);
    const to = toTime(win[3], undefined, win[4]);
    if (!from || !to || to.hour <= from.hour) return fail('unrecognized', `Couldn't read the hours in "${win[0].trim()}".`);
    window = { from: from.hour, to: to.hour };
    s = s.replace(win[0], ' ');
  }

  // Days of the week.
  let dow: string | null = null;
  const range = s.match(new RegExp(`\\b(${DAY_WORD})\\s*(?:-|to|through|thru|until)\\s*(${DAY_WORD})\\b`));
  if (range) {
    dow = `${dayNumber(range[1])}-${dayNumber(range[2])}`;
    s = s.replace(range[0], ' ');
  } else {
    const names = s.match(new RegExp(`\\b${DAY_WORD}\\b`, 'g'));
    if (names) {
      dow = [...new Set(names.map(dayNumber))].sort((a, b) => a - b).join(',');
      s = s.replace(new RegExp(`\\b${DAY_WORD}\\b`, 'g'), ' ');
    }
  }
  if (/\bweekdays?\b/.test(s)) {
    dow = '1-5';
    s = s.replace(/\bweekdays?\b/g, ' ');
  }
  if (/\bweekends?\b/.test(s)) {
    dow = '0,6';
    s = s.replace(/\bweekends?\b/g, ' ');
  }
  let weekly = false;
  if (/\b(weekly|every week)\b/.test(s)) {
    weekly = true;
    s = s.replace(/\b(weekly|every week)\b/g, ' ');
  }
  s = s.replace(/\b(daily|every day|each day)\b/g, ' ');

  // Days of the month: "monthly", "on the 1st and 15th".
  let dom: string | null = null;
  const monthly = /\b(monthly|every month|each month|of the month|of every month)\b/.test(s);
  s = s.replace(/\b(monthly|every month|each month|of the month|of every month)\b/g, ' ');
  const dates = [...s.matchAll(/\b(?:the\s+|day\s+)?(\d{1,2})(st|nd|rd|th)\b/g)];
  if (dates.length) {
    const days = dates.map((d) => Number(d[1]));
    if (days.some((d) => d < 1 || d > 31)) return fail('unrecognized', 'Days of the month go from 1 to 31.');
    dom = [...new Set(days)].sort((a, b) => a - b).join(',');
    for (const d of dates) s = s.replace(d[0], ' ');
  } else if (monthly) {
    const onDay = s.match(/\bon\s+(?:the\s+|day\s+)(\d{1,2})\b/);
    if (onDay) {
      dom = String(Number(onDay[1]));
      s = s.replace(onDay[0], ' ');
    } else {
      dom = '1';
    }
  }

  // Times of day.
  const times: Time[] = [];
  s = s.replace(/\bnoon\b/g, ' 12:00 ').replace(/\bmidnight\b/g, ' 0:00 ');
  for (const m of [...s.matchAll(TIME_RE)]) {
    const time = toTime(m[1], m[2], m[3]?.replace(/\./g, ''));
    if (!time) return fail('unrecognized', `"${m[0].trim()}" is not a time of day.`);
    times.push(time);
  }
  s = s.replace(TIME_RE, ' ');

  const leftover = s.replace(FILLER, ' ').trim();
  if (leftover) return fail('unrecognized', `Couldn't read "${leftover}".`);

  const dowField = dow ?? (weekly ? '1' : '*');
  const domField = dom ?? '*';

  if (interval.seconds !== null) {
    if (times.length) return fail('unrecognized', 'Give either an interval or times of day, not both.');
    if (dom) return fail('unrecognized', 'An interval can be limited to days of the week, not days of the month.');
    const secs = interval.seconds;
    // A cron keeps only even steps (*/40 seconds fires at :00 and :40). Without days or hours
    // to keep to, an uneven interval simply repeats from when it's turned on.
    if (!fitsCron(secs) && !window && !dow) {
      if (secs < MIN_SCHEDULE_INTERVAL_SECONDS) {
        return fail('tooFrequent', `Schedules can run at most every ${MIN_SCHEDULE_INTERVAL_SECONDS} seconds.`);
      }
      return { ok: true, kind: 'interval', seconds: secs };
    }
    const hours = window ? `${window.from}-${window.to - 1}` : '*';
    if (secs < 60) {
      if (60 % secs !== 0) return fail('uneven', 'Seconds must divide a minute evenly (e.g. 10, 15, 20, 30).');
      return checked(`${secs === 1 ? '*' : `*/${secs}`} * ${hours} * * ${dowField}`);
    }
    if (secs < 3600) {
      const mins = secs / 60;
      if (!Number.isInteger(mins) || 60 % mins !== 0) {
        return fail('uneven', 'Minutes must divide an hour evenly (e.g. 5, 10, 15, 20, 30).');
      }
      return checked(`${mins === 1 ? '*' : `*/${mins}`} ${hours} * * ${dowField}`);
    }
    const hrs = secs / 3600;
    if (!Number.isInteger(hrs) || hrs > 24 || 24 % hrs !== 0) {
      return fail('uneven', 'Hours must divide a day evenly (e.g. 2, 3, 4, 6, 12).');
    }
    if (hrs === 24) return checked(`0 0 * * ${dowField}`);
    const hourField = window ? `${window.from}-${window.to}${hrs > 1 ? `/${hrs}` : ''}` : hrs === 1 ? '*' : `*/${hrs}`;
    return checked(`0 ${hourField} * * ${dowField}`);
  }

  if (window) return fail('unrecognized', 'An hour window needs an interval, e.g. "every 15 minutes between 9 and 17".');

  const at = times.length ? times : [{ hour: DEFAULT_HOUR, minute: 0 }];
  const hours = [...new Set(at.map((t) => t.hour))].sort((a, b) => a - b);
  const minutes = [...new Set(at.map((t) => t.minute))].sort((a, b) => a - b);
  // A cron runs every hour × every minute listed, so the times must form that grid.
  if (hours.length * minutes.length !== new Set(at.map((t) => `${t.hour}:${t.minute}`)).size) {
    return fail('mixedTimes', 'These times need separate schedules (one cron can only combine every hour with every minute listed).');
  }
  return checked(`${minutes.join(',')} ${hours.join(',')} ${domField} * ${dowField}`);
}

function checked(cron: string): ParsedSchedule {
  const check = checkCron(cron);
  return check.ok ? { ok: true, kind: 'cron', cron } : check;
}

function parseOnce(text: string, now: Date): ParsedSchedule {
  const input = text.trim().replace(/^(once|una vez)\s+/i, '');
  for (const parser of [chrono.en, chrono.es]) {
    const [result] = parser.parse(input, now, { forwardDate: true });
    if (!result) continue;
    const rest = (input.slice(0, result.index) + input.slice(result.index + result.text.length))
      .toLowerCase()
      .replace(/\b(on|at|el|a las|run|it)\b|,/g, ' ')
      .trim();
    if (rest) return fail('unrecognized', `Couldn't read "${rest}".`);
    const runAt = result.start.date();
    if (!result.start.isCertain('hour')) runAt.setHours(DEFAULT_HOUR, 0, 0, 0);
    else if (!result.start.isCertain('second')) runAt.setSeconds(0, 0);
    if (runAt.getTime() <= now.getTime()) return fail('inPast', 'That time has already passed.');
    return { ok: true, kind: 'once', runAt };
  }
  return fail('unrecognized', 'Try "every weekday at 9am", "every 30 seconds" or "tomorrow at 8am".');
}

/**
 * Reads a schedule from a cron expression or plain words (English or Spanish):
 * "every 20 seconds", "every weekday at 9am", "every monday and friday at 17:30",
 * "every 15 minutes between 9 and 17", "on the 1st of every month", "tomorrow at 8am",
 * "next friday at 5pm", "in 2 hours", "cada día a las 9", "mañana a las 8".
 */
export function parseSchedule(text: string, now: Date = new Date()): ParsedSchedule {
  const raw = (text ?? '').trim();
  if (!raw) return fail('empty', 'Say when it should run.');
  if (isCronExpression(raw)) {
    const check = checkCron(raw, now);
    return check.ok ? { ok: true, kind: 'cron', cron: raw.split(/\s+/).join(' ') } : check;
  }
  const words = normalize(raw);
  if (RECURRING_WORD.test(words)) return parseRecurring(words);
  return parseOnce(raw, now);
}

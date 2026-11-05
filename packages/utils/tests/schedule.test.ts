import { describe, expect, it } from 'vitest';
import {
  checkCron,
  cronHasSeconds,
  describeCron,
  describeInterval,
  isCronExpression,
  nextCronRuns,
  nextIntervalRuns,
  parseSchedule,
} from '../src/schedule';

// Thursday 22 Oct 2026, 10:15 local time.
const NOW = new Date(2026, 9, 22, 10, 15, 0);

function cronOf(text: string) {
  const r = parseSchedule(text, NOW);
  if (!r.ok || r.kind !== 'cron') throw new Error(`${text} → ${JSON.stringify(r)}`);
  return r.cron;
}

function onceOf(text: string) {
  const r = parseSchedule(text, NOW);
  if (!r.ok || r.kind !== 'once') throw new Error(`${text} → ${JSON.stringify(r)}`);
  return r.runAt;
}

function errorOf(text: string) {
  const r = parseSchedule(text, NOW);
  if (r.ok) throw new Error(`${text} parsed as ${JSON.stringify(r)}`);
  return r.error;
}

describe('cron expressions', () => {
  it('accepts 5 and 6 fields', () => {
    expect(cronOf('0 9 * * 1-5')).toBe('0 9 * * 1-5');
    expect(cronOf('*/20 * * * * *')).toBe('*/20 * * * * *');
    expect(cronOf('0  9 * *   mon-fri')).toBe('0 9 * * mon-fri');
  });

  it('tells cron from words', () => {
    expect(isCronExpression('0 9 * * 1-5')).toBe(true);
    expect(isCronExpression('every day at 9')).toBe(false);
    expect(isCronExpression('at 9 am on mon')).toBe(false);
    expect(cronHasSeconds('*/20 * * * * *')).toBe(true);
    expect(cronHasSeconds('0 9 * * *')).toBe(false);
  });

  it('refuses unreadable and too-frequent crons', () => {
    expect(errorOf('99 9 * * *')).toBe('invalidCron');
    expect(errorOf('*/5 * * * * *')).toBe('tooFrequent');
    expect(errorOf('* * * * * *')).toBe('tooFrequent');
    expect(errorOf('0,5 * * * * *')).toBe('tooFrequent');
    expect(checkCron('*/10 * * * * *', NOW).ok).toBe(true);
  });

  it('lists the next runs', () => {
    const runs = nextCronRuns('*/20 * * * * *', 3, NOW);
    expect(runs.map((d) => d.getSeconds())).toEqual([20, 40, 0]);
    expect(nextCronRuns('nonsense', 3, NOW)).toEqual([]);
  });

  it('describes crons in English and Spanish', () => {
    expect(describeCron('0 9 * * 1-5')).toBe('At 09:00, Monday through Friday');
    expect(describeCron('*/20 * * * * *', 'es')).toBe('Cada 20 segundos');
    expect(describeCron('not a cron')).toBe('not a cron');
  });
});

describe('repeating schedules in words', () => {
  it.each([
    ['every 20 seconds', '*/20 * * * * *'],
    ['every 30 secs', '*/30 * * * * *'],
    ['every minute', '* * * * *'],
    ['every 5 minutes', '*/5 * * * *'],
    ['every half hour', '*/30 * * * *'],
    ['every hour', '0 * * * *'],
    ['hourly', '0 * * * *'],
    ['every 2 hours', '0 */2 * * *'],
    ['every 120 minutes', '0 */2 * * *'],
    ['every day', '0 9 * * *'],
    ['daily at 7:30', '30 7 * * *'],
    ['every day at 9am', '0 9 * * *'],
    ['every day at 9:15 pm', '15 21 * * *'],
    ['every day at noon', '0 12 * * *'],
    ['every day at midnight', '0 0 * * *'],
    ['every day at 9am and 5pm', '0 9,17 * * *'],
    ['every weekday at 9am', '0 9 * * 1-5'],
    ['weekdays at 8', '0 8 * * 1-5'],
    ['every weekend at 10', '0 10 * * 0,6'],
    ['every monday', '0 9 * * 1'],
    ['mondays at 17:30', '30 17 * * 1'],
    ['every monday and friday at 5pm', '0 17 * * 1,5'],
    ['every mon, wed, fri at 6am', '0 6 * * 1,3,5'],
    ['every monday to friday at 8am', '0 8 * * 1-5'],
    ['weekly', '0 9 * * 1'],
    ['weekly on friday at 4pm', '0 16 * * 5'],
    ['monthly', '0 9 1 * *'],
    ['every month on the 15th at 8', '0 8 15 * *'],
    ['on the 1st and 15th of every month at 6am', '0 6 1,15 * *'],
    ['every 15 minutes on weekdays', '*/15 * * * 1-5'],
    ['every 15 minutes between 9 and 17', '*/15 9-16 * * *'],
    ['every 2 hours from 8am to 6pm on weekdays', '0 8-18/2 * * 1-5'],
    ['Every weekday at 9AM.', '0 9 * * 1-5'],
  ])('%s → %s', (text, cron) => {
    expect(cronOf(text)).toBe(cron);
  });

  it.each([
    ['cada 20 segundos', '*/20 * * * * *'],
    ['cada hora', '0 * * * *'],
    ['cada media hora', '*/30 * * * *'],
    ['todos los días a las 9', '0 9 * * *'],
    ['cada día a las 7:30', '30 7 * * *'],
    ['de lunes a viernes a las 8', '0 8 * * 1-5'],
    ['entre semana a las 9 de la mañana', '0 9 * * 1-5'],
    ['todos los lunes a las 5 de la tarde', '0 17 * * 1'],
    ['los lunes y viernes a las 10', '0 10 * * 1,5'],
    ['cada 15 minutos entre 9 y 17', '*/15 9-16 * * *'],
    ['fines de semana a mediodía', '0 12 * * 0,6'],
    ['el día 1 de cada mes a las 9', '0 9 1 * *'],
    ['el día 15 de cada mes', '0 9 15 * *'],
  ])('%s → %s', (text, cron) => {
    expect(cronOf(text)).toBe(cron);
  });

  it('refuses what a cron cannot express', () => {
    expect(errorOf('every 5 seconds')).toBe('tooFrequent');
    expect(errorOf('every second')).toBe('tooFrequent');
    expect(errorOf('every 45 seconds on weekdays')).toBe('uneven');
    expect(errorOf('every 90 minutes between 9 and 17')).toBe('uneven');
    expect(errorOf('every day at 9:00 and 17:30')).toBe('mixedTimes');
    expect(errorOf('every day at 25:00')).toBe('unrecognized');
    expect(errorOf('every day at 9 except holidays')).toBe('unrecognized');
    expect(errorOf('every hour at 9am')).toBe('unrecognized');
    expect(errorOf('every day between 9 and 17')).toBe('unrecognized');
  });
});

describe('intervals a cron cannot keep even', () => {
  function intervalOf(text: string) {
    const r = parseSchedule(text, NOW);
    if (!r.ok || r.kind !== 'interval') throw new Error(`${text} → ${JSON.stringify(r)}`);
    return r.seconds;
  }

  it.each([
    ['every 40 seconds', 40],
    ['every 45 seconds', 45],
    ['every 90 minutes', 5400],
    ['every 5 hours', 18000],
    ['every 36 hours', 129600],
    ['every 2 days', 172800],
    ['cada 40 segundos', 40],
    ['cada 2 días', 172800],
  ])('%s → every %i s', (text, seconds) => {
    expect(intervalOf(text)).toBe(seconds);
  });

  it('keeps even intervals as crons, and the 10-second minimum', () => {
    expect(cronOf('every 30 seconds')).toBe('*/30 * * * * *');
    expect(cronOf('every 2 hours')).toBe('0 */2 * * *');
    expect(errorOf('every 7 seconds')).toBe('tooFrequent');
  });

  it('describes them in English and Spanish', () => {
    expect(describeInterval(40)).toBe('Every 40 seconds');
    expect(describeInterval(5400)).toBe('Every 90 minutes');
    expect(describeInterval(3600)).toBe('Every 1 hour');
    expect(describeInterval(172800, 'es')).toBe('Cada 2 días');
  });

  it('lists the next runs from when it started counting', () => {
    const since = new Date(NOW.getTime() - 100_000); // 100 s ago, every 40 s → next at +120 s
    expect(nextIntervalRuns(40, 2, since, NOW).map((d) => (d.getTime() - since.getTime()) / 1000)).toEqual([120, 160]);
    expect(nextIntervalRuns(40, 1, NOW, NOW)[0].getTime() - NOW.getTime()).toBe(40_000);
  });
});

describe('one-time schedules', () => {
  it('reads dates and defaults the time to 9:00', () => {
    expect(onceOf('tomorrow')).toEqual(new Date(2026, 9, 23, 9, 0, 0));
    expect(onceOf('tomorrow at 8am')).toEqual(new Date(2026, 9, 23, 8, 0, 0));
    expect(onceOf('once tomorrow at 17:30')).toEqual(new Date(2026, 9, 23, 17, 30, 0));
    expect(onceOf('friday at 5pm')).toEqual(new Date(2026, 9, 23, 17, 0, 0));
    expect(onceOf('next monday')).toEqual(new Date(2026, 9, 26, 9, 0, 0));
    expect(onceOf('today at 6pm')).toEqual(new Date(2026, 9, 22, 18, 0, 0));
    expect(onceOf('2026-11-01 08:00')).toEqual(new Date(2026, 10, 1, 8, 0, 0));
    expect(onceOf('in 2 hours')).toEqual(new Date(2026, 9, 22, 12, 15, 0));
  });

  it('reads Spanish dates', () => {
    expect(onceOf('mañana a las 8')).toEqual(new Date(2026, 9, 23, 8, 0, 0));
    expect(onceOf('mañana')).toEqual(new Date(2026, 9, 23, 9, 0, 0));
  });

  it('refuses past times, leftovers and nonsense', () => {
    expect(errorOf('today at 8am')).toBe('inPast');
    expect(errorOf('tomorrow at 8am please')).toBe('unrecognized');
    expect(errorOf('whenever you like')).toBe('unrecognized');
    expect(errorOf('   ')).toBe('empty');
  });
});

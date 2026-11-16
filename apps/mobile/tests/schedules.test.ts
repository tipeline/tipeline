import { describe, expect, it } from 'vitest';
import { nextUp, previewWhen, repeatText, scheduleState } from '../src/lib/schedules';
import type { ScheduleItem } from '../src/lib/inbox';

const now = new Date('2026-11-15T12:00:00');

describe('previewWhen', () => {
  it('reads repeating words into a cron or an interval, described in the app language', () => {
    const weekdays = previewWhen('every weekday at 9am', 'en', now);
    expect(weekdays).toMatchObject({ ok: true, kind: 'repeat', timing: { cron: '0 9 * * 1-5' } });
    expect(weekdays.ok && weekdays.kind === 'repeat' && weekdays.text).toMatch(/09:00/);
    expect(previewWhen('every 30 seconds', 'en', now)).toMatchObject({ ok: true, timing: { cron: '*/30 * * * * *' } });
    expect(previewWhen('every 40 seconds', 'en', now)).toMatchObject({ ok: true, timing: { everySeconds: 40 } });
    const es = previewWhen('cada día a las 9', 'es', now);
    expect(es.ok && es.kind === 'repeat' && es.text).toMatch(/09:00/);
  });

  it("sends a one-time schedule as the exact time the person meant (their own clock)", () => {
    const once = previewWhen('tomorrow at 8am', 'en', now);
    expect(once.ok && once.kind).toBe('once');
    if (once.ok && once.kind === 'once') {
      expect(once.at.getHours()).toBe(8);
      expect(once.timing).toEqual({ runAt: once.at.toISOString() });
    }
  });

  it('says what is wrong', () => {
    expect(previewWhen('whenever', 'en', now)).toMatchObject({ ok: false, error: 'unrecognized' });
    expect(previewWhen('every 2 seconds', 'en', now)).toMatchObject({ ok: false, error: 'tooFrequent' });
  });
});

describe('schedule lines', () => {
  const s = (over: Partial<ScheduleItem>): ScheduleItem => ({
    scheduleIdentifier: 'x',
    taskIdentifier: 't',
    taskName: 'T',
    cron: null,
    runAt: null,
    everySeconds: null,
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    ...over,
  });

  it('describes repeating schedules and leaves one-time ones to the caller', () => {
    expect(repeatText(s({ everySeconds: 40 }), 'en')).toMatch(/40 seconds/);
    expect(repeatText(s({ runAt: '2026-11-20T08:00:00Z' }), 'en')).toBeNull();
  });

  it('tells done from paused', () => {
    expect(scheduleState(s({}))).toBe('active');
    expect(scheduleState(s({ enabled: false }))).toBe('paused');
    expect(scheduleState(s({ enabled: false, runAt: '2026-11-14T08:00:00Z', lastRunAt: '2026-11-14T08:00:01Z' }))).toBe('done');
  });

  it('finds the next schedule to run among those on', () => {
    const list = [
      s({ scheduleIdentifier: 'later', nextRunAt: '2026-11-16T09:00:00Z' }),
      s({ scheduleIdentifier: 'off', enabled: false, nextRunAt: '2026-11-15T13:00:00Z' }),
      s({ scheduleIdentifier: 'soon', nextRunAt: '2026-11-15T17:00:00Z' }),
    ];
    expect(nextUp(list)?.scheduleIdentifier).toBe('soon');
    expect(nextUp([])).toBeNull();
  });
});

describe('time zones', () => {
  it("names the server's zone on a cron when it isn't the phone's", () => {
    const timing = { cron: '30 17 * * 1-5', runAt: null, everySeconds: null, timezone: 'UTC' };
    expect(repeatText(timing, 'en', 'America/Costa_Rica')).toBe('At 17:30, Monday through Friday (UTC)');
    expect(repeatText(timing, 'en', 'UTC')).toBe('At 17:30, Monday through Friday');
  });
});

import { describe, expect, it } from 'vitest';
import { dayOf, eventsFrom } from '@/utils/appCalendar';

describe('eventsFrom', () => {
  it('a date alone is all day; a date and time is timed; usual key names are found', () => {
    const events = eventsFrom([
      { id: 7, title: 'Holiday', date: '2026-10-12' },
      { name: 'Call', start: '2026-10-08T14:00:00', end: '2026-10-08T15:00:00' },
      { summary: 'Trip', startAt: '2026-10-20', end_at: '2026-10-23' },
    ]);
    expect(events.map((e) => [e.id, e.title, e.start, e.end, e.allDay])).toEqual([
      ['7', 'Holiday', '2026-10-12', undefined, true],
      ['1', 'Call', '2026-10-08T14:00:00', '2026-10-08T15:00:00', false],
      ['2', 'Trip', '2026-10-20', '2026-10-23', true],
    ]);
  });

  it('keys can be given (paths too); rows without a start are skipped, keeping positions', () => {
    const events = eventsFrom(
      [{ when: { from: 'nope' } }, { what: 'Audit', when: { from: '2026-11-02T09:30:00Z' } }],
      { titleKey: 'what', startKey: 'when.from' }
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Audit', allDay: false, extendedProps: { index: 1 } });
  });

  it('colors like badges, as solid colors the calendar can use', () => {
    const rows = [{ start: '2026-10-01', status: 'confirmed' }, { start: '2026-10-02', status: 'canceled' }, { start: '2026-10-03', status: 'pending' }];
    const events = eventsFrom(rows, { colorKey: 'status', colors: { confirmed: 'green' } });
    expect(events.map((e) => e.color)).toEqual(['green', 'red', 'amber']);
    expect(events[0].backgroundColor).toBe('#10b981');
    expect(eventsFrom(rows)[0].color).toBe('blue');
  });

  it('hex colors are used as is: the value itself, in colors, or as defaultColor', () => {
    const rows = [
      { start: '2026-10-01', calendarColor: '#039be5' },
      { start: '2026-10-02', calendarColor: '#F6BF26' },
      { start: '2026-10-03', calendarColor: 'Holidays' },
      { start: '2026-10-04', calendarColor: 'TAMs' },
      { start: '2026-10-05' },
    ];
    const events = eventsFrom(rows, {
      colorKey: 'calendarColor',
      colors: { holidays: '#0b8043', TAMs: 'purple' },
      defaultColor: '#616161',
    });
    expect(events.map((e) => e.color)).toEqual(['#039be5', '#F6BF26', '#0b8043', 'purple', '#616161']);
    expect(events.map((e) => e.backgroundColor)).toEqual(['#039be5', '#F6BF26', '#0b8043', '#8b5cf6', '#616161']);
    expect(events[1].borderColor).toBe('#F6BF26');
    expect(eventsFrom([{ start: '2026-10-01' }], { defaultColor: '#123' })[0].backgroundColor).toBe('#123');
    // Without a hex default, a value with no color of its own still gets a badge color.
    expect(eventsFrom([{ start: '2026-10-01', c: 'x' }], { colorKey: 'c', defaultColor: 'gray' })[0].color).toBe('gray');
  });

  it('text is white on dark colors, dark on light ones', () => {
    const [dark, light, amber] = eventsFrom(
      [{ start: '2026-10-01', c: '#3f51b5' }, { start: '2026-10-02', c: '#fbd75b' }, { start: '2026-10-03', c: 'x' }],
      { colorKey: 'c', colors: { x: 'amber' } }
    );
    expect(dark.textColor).toBe('#ffffff');
    expect(light.textColor).toBe('#111827');
    expect(amber.textColor).toBe('#111827');
  });

  it('dayOf gives local YYYY-MM-DD', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import TimelineWidget from '@/components/app/widgets/TimelineWidget.vue';
import { dayLabel, groupByDay, relativeTime, timelineItems, toTime } from '@/utils/appTimeline';

const EVENTS = [
  { id: 'a', event: 'Placed', at: '2026-10-05T09:00:00', status: 'done' },
  { id: 'b', event: 'Shipped', at: '2026-10-07T08:30:00', note: 'Tracking 1Z', status: 'active' },
  { id: 'c', event: 'Paid', at: '2026-10-05T09:05:00', status: 'done' },
  { id: 'd', event: 'Note without a time' },
];

describe('timelineItems', () => {
  it('finds time, title and description by their usual names', () => {
    const [, shipped] = timelineItems(EVENTS);
    expect(shipped).toMatchObject({ title: 'Shipped', description: 'Tracking 1Z' });
    expect(shipped.time?.getHours()).toBe(8);
  });

  it('sorts newest or oldest first; events without a time go last', () => {
    expect(timelineItems(EVENTS, { sort: 'newest' }).map((i) => i.key)).toEqual(['b', 'c', 'a', 'd']);
    expect(timelineItems(EVENTS, { sort: 'oldest' }).map((i) => i.key)).toEqual(['a', 'c', 'b', 'd']);
    expect(timelineItems(EVENTS).map((i) => i.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('given keys, colors and icons', () => {
    const [item] = timelineItems([{ when: 0, what: 'Boot', kind: 'error', icon: 'Zap' }], {
      timeKey: 'when',
      titleKey: 'what',
      colorKey: 'kind',
      iconKey: 'icon',
    });
    expect(item).toMatchObject({ title: 'Boot', color: 'red', icon: 'Zap' });
    expect(item.time?.getTime()).toBe(0);
  });

  it('a date-only time is that day here, not the day before', () => {
    expect(toTime('2026-10-05')?.getDate()).toBe(5);
    expect(toTime('nope')).toBeNull();
  });
});

describe('days and relative times', () => {
  const now = new Date(2026, 9, 7, 12, 0);
  const words = { today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow' };

  it('groups consecutive events of a day', () => {
    const days = groupByDay(timelineItems(EVENTS, { sort: 'newest' }));
    expect(days.map((d) => [d.day, d.items.map((i) => i.key).join('')])).toEqual([
      ['2026-10-07', 'b'],
      ['2026-10-05', 'ca'],
      [null, 'd'],
    ]);
  });

  it('names today, yesterday and tomorrow; other days in words', () => {
    expect(dayLabel('2026-10-07', now, 'en', words)).toBe('Today');
    expect(dayLabel('2026-10-06', now, 'en', words)).toBe('Yesterday');
    expect(dayLabel('2026-10-08', now, 'en', words)).toBe('Tomorrow');
    expect(dayLabel('2026-10-01', now, 'en', words)).toBe('Thu, Oct 1');
    expect(dayLabel('2025-12-31', now, 'en', words)).toContain('2025');
  });

  it('relative: the largest unit that fits', () => {
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now, 'en')).toBe('3 hours ago');
    expect(relativeTime(new Date(now.getTime() - 86_400_000), now, 'en')).toBe('yesterday');
    expect(relativeTime(new Date(now.getTime() + 2 * 60_000), now, 'en')).toBe('in 2 minutes');
    expect(relativeTime(now, now, 'en')).toBe('now');
  });
});

describe('TimelineWidget', () => {
  afterEach(() => vi.useRealTimers());
  const mountTimeline = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(TimelineWidget, { props: { props, componentId: 'history', ...extra }, global: { plugins: [i18n] } });

  it('shows events with day headers and clock times; colored dots', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0), toFake: ['Date'] });
    const w = mountTimeline({ data: EVENTS, sort: 'newest', groupByDay: true, colorKey: 'status' });
    expect(w.findAll('[data-testid="timeline-day"]').map((h) => h.text())).toEqual(['Today', 'Mon, Oct 5', 'Without a time']);
    expect(w.findAll('[data-item]').map((i) => i.find('.font-medium').text())).toEqual(['Shipped', 'Paid', 'Placed', 'Note without a time']);
    expect(w.get('[data-testid="timeline-time"]').text()).toBe('8:30 AM');
    expect(w.findAll('[data-color]').map((d) => d.attributes('data-color'))).toEqual(['green', 'green', 'green', 'gray']); // active and done are both green, as badges
    w.unmount();
  });

  it('relative times, with the exact time on hover', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 7, 12, 0), toFake: ['Date'] });
    const w = mountTimeline({ data: [EVENTS[1]], timeFormat: 'relative' });
    const time = w.get('[data-testid="timeline-time"]');
    expect(time.text()).toBe('3 hours ago');
    expect(time.attributes('title')).toContain('8:30');
    w.unmount();
  });

  it('a click fires itemClick with the row', async () => {
    const w = mountTimeline({ data: EVENTS, sort: 'oldest' });
    await w.findAll('[data-item] button')[1].trigger('click');
    expect(w.emitted('event')).toEqual([['itemClick', { selectedItem: EVENTS[2], selectedIndex: 2 }]]);
    w.unmount();
  });

  it('nothing yet: the empty text; in the builder a bound timeline shows samples', () => {
    const empty = mountTimeline({ data: [], emptyText: 'No history' });
    expect(empty.text()).toContain('No history');
    empty.unmount();
    const bound = mountTimeline({ data: '{= runnables.h.outputs.events =}' }, { editable: true });
    expect(bound.findAll('[data-item]')).toHaveLength(3);
    bound.unmount();
  });
});

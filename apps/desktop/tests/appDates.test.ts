import { describe, expect, it } from 'vitest';
import { dayEnd, dayStart, historyFilterValues, presetRange, toDay, toDayRange } from '@/utils/appDates';

// Wednesday 2026-10-07, mid-afternoon local time.
const today = new Date(2026, 9, 7, 15, 30);

describe('appDates', () => {
  it('presets count from today in local days', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-10-06', to: '2026-10-06' });
    expect(presetRange('last7Days', today)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(presetRange('last30Days', today)).toEqual({ from: '2026-09-08', to: '2026-10-07' });
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('thisYear', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('reads a range from a preset name or { from, to } (either order); anything else is none', () => {
    expect(toDayRange('last7Days', today)).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(toDayRange({ from: '2026-10-05', to: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(toDayRange({ from: '2026-10-05' })).toBeNull();
    expect(toDayRange('nextWeek')).toBeNull();
    expect(toDayRange(null)).toBeNull();
  });

  it('a day runs from its first to its last local instant', () => {
    const start = new Date(dayStart('2026-10-05'));
    const end = new Date(dayEnd('2026-10-05'));
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([5, 0, 0]);
    expect([end.getDate(), end.getHours(), end.getMinutes(), end.getMilliseconds()]).toEqual([5, 23, 59, 999]);
    expect(toDay(start)).toBe('2026-10-05');
  });

  it('turns a resolved history filter into what core takes', () => {
    expect(historyFilterValues({ dateFrom: '2026-10-01', dateTo: '2026-10-05', count: 3 })).toEqual({
      dateFrom: dayStart('2026-10-01'),
      dateTo: dayEnd('2026-10-05'),
      count: 3,
    });
    // an unset range (nothing picked) clears the saved dates: an open range
    expect(historyFilterValues({ dateFrom: null, dateTo: '' })).toEqual({ dateFrom: '', dateTo: '' });
    // instants pass through; keys that aren't in the filter aren't sent
    expect(historyFilterValues({ dateFrom: '2026-10-01T06:00:00.000Z' })).toEqual({ dateFrom: '2026-10-01T06:00:00.000Z' });
  });
});

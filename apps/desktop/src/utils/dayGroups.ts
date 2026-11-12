import { format, formatDistanceToNow, isToday, isYesterday, startOfDay, subDays } from 'date-fns';

// Home's tables (Recently opened, Recent runs) group rows by day and label each time to suit
// its group.

export type DayGroup = 'today' | 'yesterday' | 'week' | 'older';

export function dayGroupOf(date: Date): DayGroup {
  if (isToday(date)) return 'today';
  if (isYesterday(date)) return 'yesterday';
  return date >= subDays(startOfDay(new Date()), 6) ? 'week' : 'older';
}

/** Today says how long ago; yesterday the time; this week the day; older the date. */
export function dayGroupLabel(date: Date, group: DayGroup): string {
  if (group === 'today') return formatDistanceToNow(date, { addSuffix: true });
  if (group === 'yesterday') return format(date, 'HH:mm');
  if (group === 'week') return format(date, 'EEE');
  return format(date, 'd MMM');
}

/** Consecutive runs of rows in the same day group; `rows` must already be newest first. */
export function groupByDay<T>(rows: T[], dateOf: (row: T) => Date): { key: DayGroup; rows: T[] }[] {
  const result: { key: DayGroup; rows: T[] }[] = [];
  for (const row of rows) {
    const key = dayGroupOf(dateOf(row));
    const last = result[result.length - 1];
    if (last?.key === key) last.rows.push(row);
    else result.push({ key, rows: [row] });
  }
  return result;
}

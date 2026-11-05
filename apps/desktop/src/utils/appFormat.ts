// How app components show a value with a `format` (table columns, details fields).

export type ValueFormat = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime' | 'badge' | 'color';

export function formatValue(
  value: unknown,
  options: { format?: ValueFormat; currency?: string },
  locale: string
): string {
  if (value == null || value === '') return '';
  switch (options.format) {
    case 'number':
    case 'currency':
    case 'percent': {
      const num = Number(value);
      if (Number.isNaN(num)) return String(value);
      if (options.format === 'number') return num.toLocaleString(locale);
      if (options.format === 'percent')
        return num.toLocaleString(locale, { style: 'percent', maximumFractionDigits: 2 });
      return num.toLocaleString(locale, { style: 'currency', currency: options.currency ?? 'USD' });
    }
    case 'date':
    case 'datetime': {
      const date = toDate(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return options.format === 'date' ? date.toLocaleDateString(locale) : date.toLocaleString(locale);
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

// A date-only string ("2026-11-15") is that day where the user is. `new Date()` would
// read it as midnight UTC, which is the day before anywhere west of UTC.
function toDate(value: unknown): Date {
  const day = typeof value === 'string' ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value as string);
}

/** `a.b.c` inside an object (a plain key wins when it contains dots itself). */
export function valueAt(data: unknown, path: string): unknown {
  if (!data || typeof data !== 'object') return undefined;
  if (path in (data as object)) return (data as Record<string, unknown>)[path];
  return path
    .split('.')
    .reduce<unknown>((v, key) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined), data);
}

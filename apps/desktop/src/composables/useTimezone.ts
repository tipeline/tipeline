import { computed } from 'vue';
import { TZDate } from '@date-fns/tz';
import { CalendarDate } from '@internationalized/date';
import { useSettingsStore } from '@/store/settingsStore';

export const TIMEZONE_STORAGE_KEY = 'tipeline:timezone';

export function useTimezone() {
  const store = useSettingsStore();

  const appTimezone = computed(
    () =>
      store.get('timezone') ||
      localStorage.getItem(TIMEZONE_STORAGE_KEY) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  async function setTimezone(tz: string) {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
    await store.set('timezone', tz);
  }

  return { appTimezone, setTimezone };
}

export function applyStoredTimezone(tz: string) {
  if (tz) localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
}

// Treat naive datetime strings (no Z or offset) as UTC.
function normalizeToUTC(value: string): string {
  if (!value.includes('T')) return value + 'T00:00:00Z';
  if (value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value)) return value;
  return value + 'Z';
}

/**
 * Parse a stored date string (UTC ISO or naive→UTC) and return a CalendarDate
 * and HH:mm time string in the given IANA timezone.
 */
export function parseDateInTZ(
  value: string,
  timezone: string
): { date: CalendarDate; time: string } | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const tzDate = new TZDate(new Date(normalizeToUTC(value)), timezone);
    if (isNaN(tzDate.getTime())) return null;
    return {
      date: new CalendarDate(tzDate.getFullYear(), tzDate.getMonth() + 1, tzDate.getDate()),
      time: `${String(tzDate.getHours()).padStart(2, '0')}:${String(tzDate.getMinutes()).padStart(2, '0')}`,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a CalendarDate + HH:mm time in the given IANA timezone to a UTC ISO string.
 */
export function calendarDateToUTCISO(date: CalendarDate, time: string, timezone: string): string {
  const [h, m] = time.split(':').map(Number);
  const tzDate = new TZDate(date.year, date.month - 1, date.day, h, m, 0, 0, timezone);
  return tzDate.toISOString();
}

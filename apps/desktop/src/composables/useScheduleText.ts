import { useI18n } from 'vue-i18n';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { describeCron, describeInterval } from '@tipeline/utils';
import { useTimezone } from '@/composables/useTimezone';

type Timing = { cron?: string | null; runAt?: string | null; everySeconds?: number | null };
type ScheduleState = Timing & { enabled: boolean; lastRunAt?: string | null };

/** How a schedule reads in the UI: its timing in words, its times, and whether it's on. */
export function useScheduleText() {
  const { t, locale } = useI18n();
  const { appTimezone } = useTimezone();

  function formatTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    try {
      return format(new TZDate(new Date(value), appTimezone.value), 'EEE d MMM, HH:mm');
    } catch {
      return String(value);
    }
  }

  /** "At 09:00, Monday through Friday", "Every 40 seconds", or "Once, Thu 23 Oct, 08:00". */
  function describe(timing: Timing): string {
    const lang = String(locale.value).split('-')[0];
    if (timing.cron) return describeCron(timing.cron, lang);
    if (timing.everySeconds) return describeInterval(timing.everySeconds, lang);
    if (timing.runAt) return t('schedules.once', { date: formatTime(timing.runAt) });
    return '—';
  }

  /** A one-time schedule that already ran is done, not paused. */
  function status(schedule: ScheduleState): 'active' | 'paused' | 'done' {
    if (schedule.enabled) return 'active';
    return schedule.runAt && schedule.lastRunAt ? 'done' : 'paused';
  }

  return { describe, formatTime, status };
}

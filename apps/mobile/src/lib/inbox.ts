/** A workflow in `taskList`, with its latest run. */
export interface WorkflowWithLastRun {
  identifier: string;
  name: string;
  helper?: unknown;
  last_run_status?: string | null;
  last_run_at?: string | null;
  last_run_identifier?: string | null;
}

/** A schedule in `scheduleList`. */
export interface ScheduleItem {
  scheduleIdentifier: string;
  taskIdentifier: string;
  taskName: string;
  cron: string | null;
  runAt: string | null;
  everySeconds: number | null;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  /** When a repeating schedule should have run but didn't (Core was off). */
  missedAt?: string;
  /** The time zone its cron runs in (Core's). */
  timezone?: string;
}

/** An alert a workflow raised (`alertList`). */
export interface AlertItem {
  id: string;
  taskIdentifier: string;
  workflowName: string | null;
  pipelineIdentifier: string | null;
  title: string;
  message: string | null;
  level: 'info' | 'warning' | 'critical' | string;
  status: 'open' | 'dismissed' | 'resolved' | string;
  count: number;
  lastRaisedAt: string;
}

/** Dismissed on this phone: an item and the occurrence it was about (a run, a missed time). */
export type Dismissed = (key: string, occurrence: string) => boolean;
export const dismissedEntry = (key: string, occurrence: string) => `${key}@${occurrence}`;

/** Which failed run a dismissal is about (the same key Desktop uses). */
export const failedRunKey = (w: WorkflowWithLastRun) => w.last_run_identifier ?? w.last_run_at ?? '';
export const missedKey = (s: ScheduleItem) => `schedule:${s.scheduleIdentifier}`;

/** Workflows whose latest run failed, newest first, minus the ones dismissed for that run. */
export function failingWorkflows(workflows: WorkflowWithLastRun[], dismissed: Dismissed): WorkflowWithLastRun[] {
  return workflows
    .filter((w) => w.last_run_status === 'failed' && !dismissed(w.identifier, failedRunKey(w)))
    .sort((a, b) => Date.parse(b.last_run_at ?? '') - Date.parse(a.last_run_at ?? '') || 0);
}

/** Schedules that should have run but didn't, newest first, minus the dismissed ones. */
export function missedSchedules(schedules: ScheduleItem[], dismissed: Dismissed): ScheduleItem[] {
  return schedules
    .filter((s) => s.enabled && s.missedAt && !dismissed(missedKey(s), s.missedAt))
    .sort((a, b) => Date.parse(b.missedAt!) - Date.parse(a.missedAt!));
}

/** Open alerts, the serious ones first. Info alerts are listed but not counted. */
export function openAlerts(alerts: AlertItem[]): AlertItem[] {
  const rank = (a: AlertItem) => (a.level === 'critical' ? 0 : a.level === 'warning' ? 1 : 2);
  return alerts
    .filter((a) => a.status === 'open')
    .sort((a, b) => rank(a) - rank(b) || Date.parse(b.lastRaisedAt) - Date.parse(a.lastRaisedAt));
}
export const countsAlert = (a: AlertItem) => a.status === 'open' && a.level !== 'info';

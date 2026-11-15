import type { PendingApproval } from '@/components/approvals/ApprovalCard.vue';
import type { AlertItem } from '@/store/alertsStore';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';

// What the tray popover lists, worked out apart from the component so the order and the
// limits are easy to test. The dashboard's Needs you shows everything newest first; the
// popover only has room for a few, so it shows the most urgent first.

/** How many "needs you" items and running runs the popover shows before "See all" / "+N more". */
export const NEEDS_LIMIT = 4;
export const RUNNING_LIMIT = 3;

export type TrayKind = 'alert' | 'approval' | 'failed' | 'missed';

export type TrayNeed =
  | { kind: 'approval'; key: string; at: string | null; path: string; item: PendingApproval }
  | { kind: 'alert'; key: string; at: string | null; path: string; item: AlertItem }
  | { kind: 'failed'; key: string; at: string | null; path: string; item: TaskItem }
  | { kind: 'missed'; key: string; at: string | null; path: string; item: ScheduleItem };

/** A run in progress, from Core's run list (status running). */
export interface RunningRun {
  identifier: string;
  task_identifier: string;
  task_name: string;
  started_at: string | null;
}

/**
 * Most urgent first: a critical alert, then a decision someone is waiting for, a run that
 * failed, a warning, a schedule that didn't run, and last an info alert.
 */
export function urgency(need: TrayNeed): number {
  switch (need.kind) {
    case 'alert':
      return need.item.level === 'critical' ? 0 : need.item.level === 'warning' ? 3 : 5;
    case 'approval':
      return 1;
    case 'failed':
      return 2;
    case 'missed':
      return 4;
  }
}

export const runPath = (taskIdentifier: string, pipelineIdentifier: string) =>
  `/tasks/${taskIdentifier}/pipelines/${pipelineIdentifier}`;

export function trayNeeds(input: {
  approvals: PendingApproval[];
  alerts: AlertItem[];
  failing: TaskItem[];
  missed: ScheduleItem[];
}): TrayNeed[] {
  const list: TrayNeed[] = [
    ...input.approvals.map((item) => ({
      kind: 'approval' as const,
      key: `approval:${item.pipelineIdentifier}`,
      at: item.requestedAt ?? null,
      path: '/approvals',
      item,
    })),
    ...input.alerts.map((item) => ({
      kind: 'alert' as const,
      key: `alert:${item.id}`,
      at: item.lastRaisedAt,
      path: item.pipelineIdentifier ? runPath(item.taskIdentifier, item.pipelineIdentifier) : `/tasks/${item.taskIdentifier}`,
      item,
    })),
    ...input.failing.map((item) => ({
      kind: 'failed' as const,
      key: `failed:${item.identifier}`,
      at: item.last_run_at,
      path: item.last_run_identifier ? runPath(item.identifier, item.last_run_identifier) : `/tasks/${item.identifier}`,
      item,
    })),
    ...input.missed.map((item) => ({
      kind: 'missed' as const,
      key: `missed:${item.scheduleIdentifier}`,
      at: item.missedAt ?? null,
      path: `/tasks/${item.taskIdentifier}`,
      item,
    })),
  ];
  return list.sort((a, b) => urgency(a) - urgency(b) || Date.parse(b.at ?? '0') - Date.parse(a.at ?? '0'));
}

/** The first `limit` and how many more there are. */
export function firstOf<T>(items: T[], limit: number): { shown: T[]; more: number } {
  return { shown: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

/** The title a need shows (and the Linux menu uses). */
export function needTitle(need: TrayNeed): string {
  switch (need.kind) {
    case 'approval':
      return need.item.title;
    case 'alert':
      return need.item.title;
    case 'failed':
      return need.item.name;
    case 'missed':
      return need.item.taskName;
  }
}

/** The next enabled schedule, for the line under the lists. */
export function nextScheduled(schedules: ScheduleItem[]): ScheduleItem | null {
  return (
    schedules
      .filter((s) => s.enabled && s.nextRunAt)
      .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0] ?? null
  );
}

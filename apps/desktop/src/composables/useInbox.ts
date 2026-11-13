import { computed, type Ref } from 'vue';
import type { TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useInboxStore } from '@/store/inbox';

// Which failed run a dismissal is about: its identifier, or its time for older cores.
export const failedRunKey = (task: TaskItem) => task.last_run_identifier ?? task.last_run_at ?? '';

// Missed runs are dismissed per schedule and missed time, kept apart from the workflow's failures.
const missedKey = (schedule: ScheduleItem) => `schedule:${schedule.scheduleIdentifier}`;

/**
 * What only the user can act on: approvals they can decide, workflows whose latest run
 * failed, and scheduled runs that didn't happen (Core was off) — minus the ones they
 * dismissed. Home's "Needs you" list and its count both read from here, so they agree.
 */
export function useInbox(
  tasks: Ref<TaskItem[] | null | undefined>,
  schedules?: Ref<ScheduleItem[] | null | undefined>
) {
  const approvals = useApprovalsStore();
  const inbox = useInboxStore();

  const failing = computed<TaskItem[]>(() =>
    (tasks.value ?? [])
      .filter((t) => t.last_run_status === 'failed' && !inbox.isDismissed(t.identifier, failedRunKey(t)))
      .sort((a, b) => new Date(b.last_run_at ?? 0).getTime() - new Date(a.last_run_at ?? 0).getTime())
  );

  const missed = computed<ScheduleItem[]>(() =>
    (schedules?.value ?? [])
      .filter((s) => s.enabled && s.missedAt && !inbox.isDismissed(missedKey(s), s.missedAt))
      .sort((a, b) => Date.parse(b.missedAt!) - Date.parse(a.missedAt!))
  );

  const count = computed(() => approvals.actionable.length + failing.value.length + missed.value.length);

  function dismiss(task: TaskItem) {
    inbox.dismiss(task.identifier, failedRunKey(task));
  }

  function dismissMissed(schedule: ScheduleItem) {
    if (schedule.missedAt) inbox.dismiss(missedKey(schedule), schedule.missedAt);
  }

  return { approvals: computed(() => approvals.actionable), failing, missed, count, dismiss, dismissMissed };
}

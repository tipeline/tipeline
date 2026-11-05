import { computed, type Ref } from 'vue';
import type { TaskItem } from '@/config/tables/TasksList';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useInboxStore } from '@/store/inbox';

// Which failed run a dismissal is about: its identifier, or its time for older cores.
export const failedRunKey = (task: TaskItem) => task.last_run_identifier ?? task.last_run_at ?? '';

/**
 * What only the user can act on: approvals they can decide, and workflows whose latest run
 * failed and that they haven't dismissed. The dashboard card and its title badge both
 * read `count`, so the two numbers always match.
 */
export function useInbox(tasks: Ref<TaskItem[] | null | undefined>) {
  const approvals = useApprovalsStore();
  const inbox = useInboxStore();

  const failing = computed<TaskItem[]>(() =>
    (tasks.value ?? [])
      .filter((t) => t.last_run_status === 'failed' && !inbox.isDismissed(t.identifier, failedRunKey(t)))
      .sort((a, b) => new Date(b.last_run_at ?? 0).getTime() - new Date(a.last_run_at ?? 0).getTime())
  );

  const count = computed(() => approvals.actionable.length + failing.value.length);

  function dismiss(task: TaskItem) {
    inbox.dismiss(task.identifier, failedRunKey(task));
  }

  return { approvals: computed(() => approvals.actionable), failing, count, dismiss };
}

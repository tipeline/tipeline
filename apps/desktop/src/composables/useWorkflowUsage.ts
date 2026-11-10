import { computed, ref, watch, type WatchSource } from 'vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

export type WorkflowUser = {
  identifier: string;
  name: string;
  /** Every project the app or workflow is in. */
  projects: { identifier: string; name: string; color: string | null }[];
};

/** "Desk · Sales, Ops", or just the name when it's in no project. */
export const userLabel = (user: Pick<WorkflowUser, 'name' | 'projects'>, separator = ' · ') =>
  user.projects?.length ? `${user.name}${separator}${user.projects.map((p) => p.name).join(', ')}` : user.name;

export type WorkflowSchedule = {
  identifier: string;
  cron: string | null;
  run_at: string | null;
  every_seconds: number | null;
  enabled: boolean;
};

/** What uses a workflow: apps, workflows that run it as a sub-workflow, and its schedules. */
export type WorkflowUsage = {
  apps: WorkflowUser[];
  workflows: WorkflowUser[];
  schedules: WorkflowSchedule[];
};

export const emptyUsage = (): WorkflowUsage => ({ apps: [], workflows: [], schedules: [] });

/** Usage is a hint, so a failed fetch counts as nothing using it. */
export async function fetchWorkflowUsage(identifier: string): Promise<WorkflowUsage> {
  try {
    const result = await invokeCore<Partial<WorkflowUsage>>(SEND.TASK_USAGE, { identifier });
    return { apps: result?.apps ?? [], workflows: result?.workflows ?? [], schedules: result?.schedules ?? [] };
  } catch {
    return emptyUsage();
  }
}

/** Whether anything uses the workflow. */
export const isUsed = (usage: WorkflowUsage) =>
  usage.apps.length + usage.workflows.length + usage.schedules.length > 0;

/**
 * What uses a workflow (core reads the app and workflow sources). Refetched whenever
 * the identifier changes; a falsy identifier (e.g. a closed dialog) clears it.
 */
export function useWorkflowUsage(identifier: WatchSource<string | null | undefined>) {
  const usage = ref<WorkflowUsage>(emptyUsage());
  watch(
    identifier,
    async (id) => {
      usage.value = emptyUsage();
      if (!id) return;
      usage.value = await fetchWorkflowUsage(id);
    },
    { immediate: true }
  );
  return { usage, used: computed(() => isUsed(usage.value)) };
}

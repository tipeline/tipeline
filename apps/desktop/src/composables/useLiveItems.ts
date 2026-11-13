import { computed } from 'vue';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import type { ProjectTag } from '@/utils/projectAssign';
import type { TaskItem } from '@/config/tables/TasksList';

export type LiveItemType = 'task' | 'app' | 'project';

type LiveItem = {
  identifier: string;
  name: string;
  image?: string | null;
  projects?: ProjectTag[] | null;
  last_run_status?: TaskItem['last_run_status'];
  last_run_at?: string | null;
};

/** What Home shows next to a starred or recent entry: its projects and, for a workflow, its last run. */
export type LiveDetails = {
  projects: ProjectTag[];
  lastRunStatus: TaskItem['last_run_status'];
  lastRunAt: string | null;
};

/**
 * The dashboard's recent and starred lists live in localStorage and only learn about what
 * the user did in this window, so check them against what exists now: something deleted
 * elsewhere (CLI, another window, a remote user) or in another workspace is hidden.
 * Hidden, not forgotten — switching back to that workspace brings it back.
 */
export function useLiveItems() {
  const lists: Record<LiveItemType, ReturnType<typeof useQuery<LiveItem[]>>> = {
    task: useQuery<LiveItem[]>(SEND.TASK_LIST, {}),
    app: useQuery<LiveItem[]>(SEND.APP_LIST),
    project: useQuery<LiveItem[]>(SEND.PROJECT_LIST),
  };

  const live = computed(() => {
    const byType = new Map<LiveItemType, Map<string, LiveItem> | null>();
    for (const [type, query] of Object.entries(lists) as [LiveItemType, (typeof lists)['task']][]) {
      // A list that failed to load can't say what's gone — keep that type's entries.
      byType.set(type, query.data.value ? new Map(query.data.value.map((i) => [i.identifier, i])) : null);
    }
    return byType;
  });

  // Wait for the lists, so a deleted card doesn't flash in and vanish.
  const loaded = computed(() => Object.values(lists).every((q) => !q.isLoading.value));

  /**
   * The entries that still exist, with their current name and image (they may have been renamed),
   * plus their projects and last run when the lists know them.
   */
  function keepLive<T extends { type: LiveItemType; identifier: string; name: string; image?: string | null }>(
    entries: T[]
  ): (T & LiveDetails)[] {
    return entries.flatMap((item): (T & LiveDetails)[] => {
      const known = live.value.get(item.type);
      if (!known) return [{ ...item, projects: [], lastRunStatus: null, lastRunAt: null }];
      const current = known.get(item.identifier);
      return current
        ? [
            {
              ...item,
              name: current.name,
              image: current.image ?? item.image,
              projects: current.projects ?? [],
              lastRunStatus: current.last_run_status ?? null,
              lastRunAt: current.last_run_at ?? null,
            },
          ]
        : [];
    });
  }

  return { loaded, keepLive };
}

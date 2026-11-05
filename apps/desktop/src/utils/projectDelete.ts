import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useStreamStore } from '@/store/stream';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';
import type { WorkflowUsage } from '@/composables/useWorkflowUsage';

/** What Core's projectDeletePreview returns. */
export type ProjectDeletePreview = {
  identifier: string;
  name: string;
  workflows: ({ identifier: string; name: string } & WorkflowUsage)[];
  apps: { identifier: string; name: string }[];
};

/**
 * Deletes a project in core and forgets it in the desktop stores. With `contents`,
 * those workflows and apps go to the Trash with it (and are forgotten like a single
 * delete does); without, they're kept in no project. Throws when core refuses.
 */
export async function deleteProject(identifier: string, contents?: { workflows: string[]; apps: string[] }) {
  await invokeCore(SEND.PROJECT_DELETE, contents ? { identifier, ...contents } : { identifier });
  const recent = useRecentItemsStore();
  const starred = useStarredItemsStore();
  recent.forget('project', identifier);
  for (const id of contents?.workflows ?? []) {
    useStreamStore().removeEventsForTask(id);
    recent.forget('task', id);
    starred.unstar('task', id);
  }
  for (const id of contents?.apps ?? []) {
    recent.forget('app', id);
    starred.unstar('app', id);
  }
}

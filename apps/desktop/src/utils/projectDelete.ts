import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useStreamStore } from '@/store/stream';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';
import type { WorkflowUsage } from '@/composables/useWorkflowUsage';
import type { AlsoIn } from '@tipeline/utils';

/** What Core's projectDeletePreview returns. */
export type ProjectDeletePreview = {
  identifier: string;
  name: string;
  /** Each with `alsoIn`: the other projects it's in (deleting this one only takes it out). */
  workflows: ({ identifier: string; name: string } & WorkflowUsage & AlsoIn)[];
  apps: ({ identifier: string; name: string } & AlsoIn)[];
};

/**
 * Deletes a project in core and forgets it in the desktop stores. With `contents`,
 * those workflows and apps go to the Trash with it (and are forgotten like a single
 * delete does); without, they're kept, out of the project (still in any others). Throws when core refuses.
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

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useStreamStore } from '@/store/stream';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';

/**
 * Moves a workflow to the Trash in core and forgets it in the desktop stores. Returns
 * the trash item's id, for an Undo. Throws when core refuses.
 */
export async function deleteWorkflow(identifier: string): Promise<number | undefined> {
  const result = await invokeCore<{ trashId?: number }>(SEND.TASK_UNINSTALL, { identifier });
  // Its runs would otherwise linger in Home/Runs (rebuilt from live events) with dead links.
  useStreamStore().removeEventsForTask(identifier);
  useRecentItemsStore().forget('task', identifier);
  useStarredItemsStore().unstar('task', identifier);
  return result?.trashId;
}

import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';

/**
 * Moves an app to the Trash in core and forgets it in the desktop stores. Returns the
 * trash item's id, for an Undo. Throws when core refuses.
 */
export async function deleteApp(identifier: string): Promise<number | undefined> {
  const result = await invokeCore<{ trashId?: number }>(SEND.APP_UNINSTALL, { identifier });
  useRecentItemsStore().forget('app', identifier);
  useStarredItemsStore().unstar('app', identifier);
  return result?.trashId;
}

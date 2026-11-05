import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { toast } from '@/components/ui/sonner';

export type TrashKind = 'task' | 'app';

/** Puts a Trash item back. Throws when core refuses (its identifier was taken meanwhile). */
export async function restoreFromTrash(id: number): Promise<{ kind: TrashKind; identifier: string; name: string }> {
  return await invokeCore(SEND.TRASH_RESTORE, { id });
}

/**
 * "Moved to the Trash" with an Undo button, after deleting one workflow or app.
 * `onRestored` runs after an undo (refresh a list, or open the item again).
 */
export function showTrashedToast(kind: TrashKind, name: string, trashId: number | undefined, onRestored?: () => void) {
  const t = i18n.global.t;
  toast.success(t(`trash.moved.${kind}`, { name }), {
    action:
      trashId == null
        ? undefined
        : {
            label: t('trash.undo'),
            onClick: async () => {
              try {
                await restoreFromTrash(trashId);
                toast.success(t('trash.restored', { name }));
                onRestored?.();
              } catch (e: any) {
                toast.error(t('trash.restoreFailed'), { description: e?.message ?? String(e) });
              }
            },
          },
  });
}

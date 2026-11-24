import { useI18n } from 'vue-i18n';
import { toast } from '@/components/ui/sonner';
import { useAlertsStore, type AlertItem } from '@/store/alertsStore';

/**
 * Dismiss and reopen as people click them (Needs you, a workflow's alerts): each says what
 * happened in a toast, and a dismiss can be undone from it, since on Home the row is gone.
 */
export function useAlertActions() {
  const { t } = useI18n();
  const store = useAlertsStore();

  async function reopen(alert: Pick<AlertItem, 'id'> & Partial<Pick<AlertItem, 'level'>>) {
    await store.reopen(alert);
    toast.success(t('alerts.reopened'), { description: t('alerts.reopenedHint') });
  }

  async function dismiss(alert: Pick<AlertItem, 'id' | 'level'>, onUndone?: () => void) {
    await store.dismiss(alert);
    toast(t('alerts.dismissed'), {
      description: t('alerts.dismissedHint'),
      action: {
        label: t('alerts.undo'),
        onClick: async () => {
          try {
            await store.reopen(alert);
            onUndone?.();
          } catch (e: any) {
            toast.error(e?.message ?? String(e));
          }
        },
      },
    });
  }

  return { dismiss, reopen };
}

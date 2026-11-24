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

  type Target = Pick<AlertItem, 'id'> & Partial<Pick<AlertItem, 'level'>>;

  /** Bulk Dismiss: one toast for all of them, and Undo puts them all back. */
  async function dismissMany(alerts: Target[], onUndone?: () => void) {
    if (!alerts.length) return;
    await store.dismissMany(alerts.map((a) => a.id));
    toast(t('alerts.dismissedMany', { n: alerts.length }, alerts.length), {
      description: t('alerts.dismissedHint'),
      action: {
        label: t('alerts.undo'),
        onClick: async () => {
          try {
            await store.reopenMany(alerts);
            onUndone?.();
          } catch (e: any) {
            toast.error(e?.message ?? String(e));
          }
        },
      },
    });
  }

  async function reopenMany(alerts: Target[]) {
    if (!alerts.length) return;
    await store.reopenMany(alerts);
    toast.success(t('alerts.reopenedMany', { n: alerts.length }, alerts.length), {
      description: t('alerts.reopenedHint'),
    });
  }

  /**
   * "I fixed it": closes them for good. No Undo — the next raise is a new alert anyway, and
   * that's the point (it notifies again).
   */
  async function resolveMany(alerts: Target[]) {
    if (!alerts.length) return;
    await store.resolveMany(alerts.map((a) => a.id));
    toast.success(t('alerts.resolvedMany', { n: alerts.length }, alerts.length), {
      description: t('alerts.resolvedHint'),
    });
  }
  const resolve = (alert: Target) => resolveMany([alert]);

  return { dismiss, reopen, resolve, dismissMany, reopenMany, resolveMany };
}

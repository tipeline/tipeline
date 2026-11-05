import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';

// Exports apps with their workflows to a zip (one app, or all of them when no
// identifier is given). Unzipped, each app installs with "Install App".
export function useAppExport() {
  const { t } = useI18n();
  const { translateError } = useErrorT();
  const isExporting = ref(false);

  async function exportApps(defaultName: string, identifiers?: string[]) {
    const dialogResult = await window.ipcRenderer.invoke('dialog:save-file', {
      defaultPath: `${defaultName}.zip`,
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    });
    if (!dialogResult?.success) return;
    isExporting.value = true;
    try {
      const { count } = await invokeCore(SEND.APP_EXPORT, {
        targetPath: dialogResult.filePath,
        identifiers,
      });
      toast.success(t('apps.exportSuccess', count), {
        action: {
          label: t('common.showInFolder'),
          onClick: () => window.ipcRenderer.invoke('shell:show-item-in-folder', dialogResult.filePath),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('apps.exportFailed'), { description: translateError(msg) });
    } finally {
      isExporting.value = false;
    }
  }

  return { isExporting, exportApps };
}

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '@/components/ui/button/Button.vue';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Upload } from 'lucide-vue-next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import ArchiveCapabilities from '@/components/task/ArchiveCapabilities.vue';

type Counts = { added: number; replaced: number; skipped: number };
type RestoreResult = {
  projects: Counts;
  tasks: Counts;
  apps: Counts;
  schedules: Counts;
  variables: Counts;
  secretsWithoutValue: string[];
  warnings: string[];
};

const { t } = useI18n();
const { translateError } = useErrorT();

const openBackup = ref(false);
const includeSecrets = ref(false);
const isBackingUp = ref(false);

function handleFullBackup() {
  includeSecrets.value = false;
  openBackup.value = true;
}

const confirmFullBackup = async () => {
  const dialogResult = await window.ipcRenderer.invoke('dialog:save-file', {
    defaultPath: `tipeline-backup-${Date.now()}.zip`,
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  });
  openBackup.value = false;
  if (!dialogResult?.success) return;
  isBackingUp.value = true;
  try {
    const result = await invokeCore<{ taskCount: number; appCount: number; variableCount: number }>(
      SEND.FULL_BACKUP,
      { targetPath: dialogResult.filePath, includeSecrets: includeSecrets.value }
    );
    toast.success(
      t('settings.backup.success', { tasks: result.taskCount, apps: result.appCount, variables: result.variableCount }),
      {
        action: {
          label: t('common.showInFolder'),
          onClick: () => window.ipcRenderer.invoke('shell:show-item-in-folder', dialogResult.filePath),
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('settings.backup.failed'), { description: translateError(msg) });
  } finally {
    isBackingUp.value = false;
  }
};

const openRestore = ref(false);
const restorePath = ref('');
const replaceExisting = ref(false);
const isRestoring = ref(false);

async function handleRestore() {
  const filePath = await window.ipcRenderer.invoke('dialog:open-file', {
    filters: [{ name: t('settings.backup.restore.fileFilter'), extensions: ['zip'] }],
  });
  if (!filePath) return;
  restorePath.value = filePath;
  replaceExisting.value = false;
  openRestore.value = true;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

const confirmRestore = async () => {
  openRestore.value = false;
  isRestoring.value = true;
  try {
    const result = await invokeCore<RestoreResult>(SEND.FULL_RESTORE, {
      archivePath: restorePath.value,
      mode: replaceExisting.value ? 'replace' : 'skip',
    });
    const groups = [result.projects, result.tasks, result.apps, result.schedules, result.variables];
    const written = (c: Counts) => c.added + c.replaced;
    const skipped = groups.reduce((n, c) => n + c.skipped, 0);
    const details = [
      skipped ? t('settings.backup.restore.skipped', { count: skipped }) : '',
      result.secretsWithoutValue.length
        ? t('settings.backup.restore.secretsWithoutValue', { names: result.secretsWithoutValue.join(', ') })
        : '',
      ...result.warnings,
    ].filter(Boolean);
    const description = details.join(' ') || undefined;

    if (groups.every((c) => written(c) === 0)) {
      toast.info(t('settings.backup.restore.nothingNew'), { description });
    } else {
      const summary = t('settings.backup.restore.success', {
        tasks: written(result.tasks),
        apps: written(result.apps),
        variables: written(result.variables),
      });
      (result.warnings.length ? toast.warning : toast.success)(summary, { description, duration: 10000 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('settings.backup.restore.failed'), { description: translateError(msg) });
  } finally {
    isRestoring.value = false;
  }
};
</script>

<template>
  <AlertDialog v-model:open="openBackup">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('settings.backup.dialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('settings.backup.dialog.description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox id="backup-include-secrets" v-model="includeSecrets" />
        <label for="backup-include-secrets" class="cursor-pointer">
          {{ t('settings.backup.dialog.includeSecrets') }}
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('settings.backup.dialog.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmFullBackup">{{ t('settings.backup.dialog.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog v-model:open="openRestore">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('settings.backup.restore.dialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('settings.backup.restore.dialog.description', { file: fileName(restorePath) }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex items-start gap-2 text-sm">
        <Checkbox id="restore-replace-existing" v-model="replaceExisting" class="mt-0.5" />
        <label for="restore-replace-existing" class="cursor-pointer">
          {{ t('settings.backup.restore.dialog.replace') }}
          <span class="block text-xs text-muted-foreground mt-0.5">
            {{ t('settings.backup.restore.dialog.replaceHint') }}
          </span>
        </label>
      </div>
      <ArchiveCapabilities v-if="openRestore" :archive-path="restorePath" />
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('settings.backup.restore.dialog.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmRestore">{{ t('settings.backup.restore.dialog.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <section class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-medium">{{ t('settings.backup.title') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.backup.hint') }}</div>
      </div>
      <Button variant="outline" :disabled="isBackingUp || isRestoring" @click="handleFullBackup">
        <Download class="w-4 h-4" />
        {{ isBackingUp ? t('settings.backup.creating') : t('settings.backup.create') }}
      </Button>
    </div>
    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-medium">{{ t('settings.backup.restore.title') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.backup.restore.hint') }}</div>
      </div>
      <Button variant="outline" :disabled="isBackingUp || isRestoring" @click="handleRestore">
        <Upload class="w-4 h-4" />
        {{ isRestoring ? t('settings.backup.restore.restoring') : t('settings.backup.restore.button') }}
      </Button>
    </div>
  </section>
</template>

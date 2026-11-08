<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Page from '@/components/Page.vue';
import Button from '@/components/ui/button/Button.vue';
import Dialog from '@/components/Dialog.vue';
import ProjectForm from '@/components/project/ProjectForm.vue';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Plus, Loader2, Upload, Network } from 'lucide-vue-next';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { descriptionSummary } from '@tipeline/utils';
import ArchiveCapabilities from '@/components/task/ArchiveCapabilities.vue';

type ProjectItem = {
  identifier: string;
  name: string;
  description?: string;
  color?: string;
  task_count: number;
  app_count: number;
  created_at: string;
};

const router = useRouter();
const { t } = useI18n();
const openNew = ref(false);
const projectFormRef = ref<InstanceType<typeof ProjectForm> | null>(null);
const { data: projects, refetch } = useQuery<ProjectItem[]>(SEND.PROJECT_LIST);

function handleClose() {
  openNew.value = false;
  refetch();
}

type Counts = { added: number; replaced: number; skipped: number };
type ImportResult = {
  project?: { identifier: string; name: string };
  projects: Counts;
  tasks: Counts;
  apps: Counts;
  variables: Counts;
  secretsWithoutValue: string[];
  warnings: string[];
};

const { translateError } = useErrorT();
const openImport = ref(false);
const importPath = ref('');
const replaceExisting = ref(false);
const isImporting = ref(false);
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

async function handleImport() {
  const filePath = await window.ipcRenderer.invoke('dialog:open-file', {
    filters: [{ name: t('projects.importFileFilter'), extensions: ['zip'] }],
  });
  if (!filePath) return;
  importPath.value = filePath;
  replaceExisting.value = false;
  openImport.value = true;
}

async function confirmImport() {
  openImport.value = false;
  isImporting.value = true;
  try {
    const result = await invokeCore<ImportResult>(SEND.PROJECT_IMPORT, {
      archivePath: importPath.value,
      mode: replaceExisting.value ? 'replace' : 'skip',
    });
    refetch();
    const groups = [result.projects, result.tasks, result.apps, result.variables];
    const written = (c: Counts) => c.added + c.replaced;
    const skipped = groups.reduce((n, c) => n + c.skipped, 0);
    const description =
      [
        skipped ? t('settings.backup.restore.skipped', { count: skipped }) : '',
        result.secretsWithoutValue.length
          ? t('settings.backup.restore.secretsWithoutValue', { names: result.secretsWithoutValue.join(', ') })
          : '',
        ...result.warnings,
      ]
        .filter(Boolean)
        .join(' ') || undefined;
    const project = result.project;
    const action = project
      ? { label: t('projects.open'), onClick: () => router.push(`/projects/${project.identifier}`) }
      : undefined;

    if (groups.every((c) => written(c) === 0)) {
      toast.info(t('projects.importNothingNew'), { description, action });
    } else {
      const summary = t('projects.importSuccess', {
        tasks: written(result.tasks),
        apps: written(result.apps),
        variables: written(result.variables),
      });
      (result.warnings.length ? toast.warning : toast.success)(summary, { description, action, duration: 10000 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('projects.importFailed'), { description: translateError(msg) });
  } finally {
    isImporting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="openNew" :title="t('projects.newDialog.title')" :description="t('projects.newDialog.description')">
    <ProjectForm ref="projectFormRef" @close="handleClose" />

    <template #footer>
      <Button :disabled="projectFormRef?.isWaiting" @click="projectFormRef?.submit()">
        <Loader2 v-if="projectFormRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
        {{ projectFormRef?.isWaiting ? t('common.creating') : t('projects.new') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="openImport">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('projects.importDialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('projects.importDialog.description', { file: fileName(importPath) }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex items-start gap-2 text-sm">
        <Checkbox id="project-import-replace" v-model="replaceExisting" class="mt-0.5" />
        <label for="project-import-replace" class="cursor-pointer">
          {{ t('projects.importDialog.replace') }}
          <span class="block text-xs text-muted-foreground mt-0.5">
            {{ t('projects.importDialog.replaceHint') }}
          </span>
        </label>
      </div>
      <ArchiveCapabilities v-if="openImport" :archive-path="importPath" project-only />
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('projects.importDialog.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmImport">{{ t('projects.importDialog.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>{{ t('projects.title') }}</template>
    <template #menu>
      <Button variant="outline" @click="router.push('/projects/map')">
        <Network class="w-4 h-4" /> {{ t('projectMap.all.open') }}
      </Button>
      <Button variant="outline" :disabled="isImporting" @click="handleImport">
        <Upload class="w-4 h-4" /> {{ isImporting ? t('projects.importing') : t('projects.import') }}
      </Button>
      <Button @click="openNew = true">
        <Plus class="w-4 h-4" /> {{ t('projects.new') }}
      </Button>
    </template>
    <template #content>
      <div class="flex-1 min-h-0 overflow-y-auto scroll-fade p-4 pb-6">
        <p class="text-sm text-muted-foreground" v-if="!projects?.length">
          {{ t('projects.empty') }}
        </p>
        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="project in projects"
            :key="project.identifier"
            class="flex flex-col gap-2 p-4 border border-border rounded-md bg-card hover:bg-muted/50 transition-colors cursor-pointer text-left"
            @click="router.push(`/projects/${project.identifier}`)"
          >
            <div class="flex items-center gap-2">
              <span
                v-if="project.color"
                class="w-3 h-3 rounded-full shrink-0"
                :style="{ backgroundColor: project.color }"
              />
              <span class="font-semibold truncate">{{ project.name }}</span>
            </div>
            <p v-if="project.description" class="text-sm text-muted-foreground line-clamp-2">
              {{ descriptionSummary(project.description) }}
            </p>
            <div class="flex gap-3 text-xs text-muted-foreground mt-auto pt-2">
              <span>{{ project.task_count }} {{ t('projects.tasks').toLowerCase() }}</span>
              <span>{{ project.app_count }} {{ t('projects.apps').toLowerCase() }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Page>
</template>

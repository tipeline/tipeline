<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/store/project';
import { useRecentItemsStore } from '@/store/recentItems';
import Page from '@/components/Page.vue';
import NotFoundState from '@/components/NotFoundState.vue';
import Dialog from '@/components/Dialog.vue';
import ProjectForm from '@/components/project/ProjectForm.vue';
import ProjectItemPicker from '@/components/project/ProjectItemPicker.vue';
import ProjectDeleteDialog from '@/components/project/ProjectDeleteDialog.vue';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { useQuery } from '@/composables/useQuery';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { renderMarkdown } from '@/utils/appMarkdown';
import { descriptionSummary, fileSlug } from '@tipeline/utils';
import { Pencil, Trash2, Workflow, AppWindow, Plus, X, Loader2, Link2, Download, BotIcon } from 'lucide-vue-next';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';
import { useAgentStore } from '@/store/agentStore';
import type { TaskItem } from '@/config/tables/TasksList';
import type { AppItem } from '@/config/tables/AppsList';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const identifier = route.params.pid as string;

const projectFormRef = ref<InstanceType<typeof ProjectForm> | null>(null);
const openEdit = ref(false);
const openDelete = ref(false);
const openAddTasks = ref(false);
const openAddApps = ref(false);
const assigning = ref<string | null>(null);

const projectStore = useProjectStore();
const recentItemsStore = useRecentItemsStore();
const { data: project, isLoading, refetch } = useQuery(SEND.PROJECT_DETAIL, { identifier });
const notFound = computed(() => !isLoading.value && !project.value);

watch(project, (p) => {
  if (p) {
    projectStore.setProject(p);
    recentItemsStore.markOpened('project', identifier, p.name);
  }
}, { immediate: true });
const { data: allTasks } = useQuery<TaskItem[]>(SEND.TASK_LIST);
const { data: allApps } = useQuery<AppItem[]>(SEND.APP_LIST);

const assignedTaskIds = computed(() => new Set((project.value?.tasks ?? []).map((t: any) => t.identifier)));
const assignedAppIds = computed(() => new Set((project.value?.apps ?? []).map((a: any) => a.identifier)));

const availableTasks = computed(() =>
  (allTasks.value ?? []).filter((t) => !assignedTaskIds.value.has(t.identifier))
);
const availableApps = computed(() =>
  (allApps.value ?? []).filter((a) => !assignedAppIds.value.has(a.identifier))
);

function handleEditClose() {
  openEdit.value = false;
  refetch();
  // The assistant panel names the project when it has instructions.
  void useAgentStore().refreshActiveProject();
}

function onDeleted() {
  router.push('/projects');
}

async function assignTask(taskIdentifier: string) {
  assigning.value = taskIdentifier;
  try {
    await invokeCore(SEND.PROJECT_ASSIGN_TASK, { projectIdentifier: identifier, taskIdentifier });
    await refetch();
  } finally {
    assigning.value = null;
    openAddTasks.value = false;
  }
}

async function unassignTask(taskIdentifier: string) {
  await invokeCore(SEND.PROJECT_UNASSIGN_TASK, { taskIdentifier });
  refetch();
}

async function assignApp(appIdentifier: string) {
  assigning.value = appIdentifier;
  try {
    await invokeCore(SEND.PROJECT_ASSIGN_APP, { projectIdentifier: identifier, appIdentifier });
    await refetch();
  } finally {
    assigning.value = null;
    openAddApps.value = false;
  }
}

async function unassignApp(appIdentifier: string) {
  await invokeCore(SEND.PROJECT_UNASSIGN_APP, { appIdentifier });
  refetch();
}

const { translateError } = useErrorT();
const openExport = ref(false);
const includeSecrets = ref(false);
const isExporting = ref(false);

function handleExport() {
  includeSecrets.value = false;
  openExport.value = true;
}

async function confirmExport() {
  const dialogResult = await window.ipcRenderer.invoke('dialog:save-file', {
    defaultPath: `${fileSlug(project.value?.name, 'project')}.zip`,
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  });
  openExport.value = false;
  if (!dialogResult?.success) return;
  isExporting.value = true;
  try {
    const result = await invokeCore<{ taskCount: number; appCount: number; variableCount: number }>(
      SEND.PROJECT_EXPORT,
      { identifier, targetPath: dialogResult.filePath, includeSecrets: includeSecrets.value }
    );
    toast.success(
      t('projects.exportSuccess', { tasks: result.taskCount, apps: result.appCount, variables: result.variableCount }),
      {
        action: {
          label: t('common.showInFolder'),
          onClick: () => window.ipcRenderer.invoke('shell:show-item-in-folder', dialogResult.filePath),
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('projects.exportFailed'), { description: translateError(msg) });
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="openEdit" :title="t('projects.editDialog.title')" :description="t('projects.editDialog.description')">
    <ProjectForm v-if="openEdit" ref="projectFormRef" :initial-data="project" @close="handleEditClose" />

    <template #footer>
      <Button :disabled="projectFormRef?.isWaiting" @click="projectFormRef?.submit()">
        <Loader2 v-if="projectFormRef?.isWaiting" class="w-4 h-4 mr-2 animate-spin" />
        {{ projectFormRef?.isWaiting
          ? (projectFormRef?.isEditing ? t('common.saving') : t('common.creating'))
          : (projectFormRef?.isEditing ? t('common.save') : t('projects.new'))
        }}
      </Button>
    </template>
  </Dialog>

  <Dialog v-model="openAddTasks" :title="t('projects.addTasksDialog.title')" :description="t('projects.addTasksDialog.description')">
    <ProjectItemPicker :items="availableTasks" :assigning="assigning" @pick="assignTask" />
  </Dialog>

  <Dialog v-model="openAddApps" :title="t('projects.addAppsDialog.title')" :description="t('projects.addAppsDialog.description')">
    <ProjectItemPicker :items="availableApps" :assigning="assigning" @pick="assignApp" />
  </Dialog>

  <ProjectDeleteDialog v-model:open="openDelete" :identifier="identifier" @deleted="onDeleted" />

  <AlertDialog v-model:open="openExport">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('projects.exportDialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('projects.exportDialog.description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox id="project-export-include-secrets" v-model="includeSecrets" />
        <label for="project-export-include-secrets" class="cursor-pointer">
          {{ t('projects.exportDialog.includeSecrets') }}
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('projects.exportDialog.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmExport">{{ t('projects.exportDialog.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>
      <div class="flex items-center gap-2">
        <span
          v-if="project?.color"
          class="w-3 h-3 rounded-full shrink-0"
          :style="{ backgroundColor: project.color }"
        />
        {{ project?.name ?? t('projects.title') }}
      </div>
    </template>

    <template v-if="project" #menu>
      <Button variant="outline" size="sm" @click="openNewTaskDialog(identifier)">
        <Plus class="w-3.5 h-3.5" /> {{ t('tasks.new') }}
      </Button>
      <Button variant="outline" size="sm" @click="openNewAppDialog(identifier)">
        <Plus class="w-3.5 h-3.5" /> {{ t('apps.new') }}
      </Button>
      <Button variant="outline" size="sm" @click="openEdit = true">
        <Pencil class="w-3.5 h-3.5" /> {{ t('common.edit') }}
      </Button>
      <Button variant="outline" size="sm" :disabled="isExporting" @click="handleExport">
        <Download class="w-3.5 h-3.5" /> {{ isExporting ? t('projects.exporting') : t('common.export') }}
      </Button>
      <Button variant="destructive" size="sm" @click="openDelete = true">
        <Trash2 class="w-3.5 h-3.5" /> {{ t('common.delete') }}
      </Button>
    </template>

    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('projects.notFound.title')"
        :description="t('projects.notFound.description')"
        :back-label="t('projects.notFound.back')"
        :back-to="{ name: 'Projects' }"
      />
      <div v-else-if="project" class="p-4 space-y-6">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
        <div v-if="project?.description" class="app-markdown text-sm text-muted-foreground" v-html="renderMarkdown(project.description)" />

        <div v-if="project?.instructions" class="rounded-lg border p-3 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <BotIcon class="w-4 h-4" /> {{ t('projects.instructions') }}
            </h3>
            <button type="button" class="text-xs text-muted-foreground hover:text-foreground hover:underline" @click="openEdit = true">
              {{ t('common.edit') }}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">{{ t('projects.instructionsHint') }}</p>
          <p class="whitespace-pre-wrap font-mono text-xs">{{ project.instructions }}</p>
        </div>

        <!-- Tasks -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Workflow class="w-4 h-4" /> {{ t('projects.tasks') }}
            </h3>
            <Button variant="outline" size="sm" @click="openAddTasks = true">
              <Plus class="w-3.5 h-3.5" /> {{ t('projects.addTasks') }}
            </Button>
          </div>
          <div v-if="project?.tasks?.length" class="space-y-2">
            <div
              v-for="task in project.tasks"
              :key="task.identifier"
              class="flex items-center justify-between rounded-lg border p-3 hover:bg-accent cursor-pointer transition-colors group"
              @click="router.push(`/tasks/${task.identifier}`)"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ task.name }}</p>
                <p v-if="task.description" class="text-xs text-muted-foreground truncate">{{ descriptionSummary(task.description) }}</p>
              </div>
              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                :title="t('projects.removeFromProject')"
                @click.stop="unassignTask(task.identifier)"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('projects.noTasks') }}</p>
        </div>

        <!-- Workflows this project's apps use that live elsewhere: shown, not assigned -->
        <div v-if="project?.shared_tasks?.length">
          <div class="mb-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Link2 class="w-4 h-4" /> {{ t('projects.sharedTasks') }}
            </h3>
            <p class="text-xs text-muted-foreground mt-1">{{ t('projects.sharedTasksHint') }}</p>
          </div>
          <div class="space-y-2">
            <div
              v-for="task in project.shared_tasks"
              :key="task.identifier"
              class="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 hover:bg-accent cursor-pointer transition-colors"
              @click="router.push(`/tasks/${task.identifier}`)"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ task.name }}</p>
                <p class="text-xs text-muted-foreground truncate">
                  {{ t('projects.usedByApps', { apps: task.apps.map((a: any) => a.name).join(', ') }) }}
                </p>
              </div>
              <button
                v-if="task.project_identifier"
                type="button"
                class="inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded border text-xs hover:bg-background transition-colors"
                @click.stop="router.push(`/projects/${task.project_identifier}`)"
              >
                <span
                  v-if="task.project_color"
                  class="w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: task.project_color }"
                />
                {{ task.project_name }}
              </button>
              <span v-else class="shrink-0 text-xs text-muted-foreground">{{ t('projects.noProject') }}</span>
            </div>
          </div>
        </div>

        <!-- Apps -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <AppWindow class="w-4 h-4" /> {{ t('projects.apps') }}
            </h3>
            <Button variant="outline" size="sm" @click="openAddApps = true">
              <Plus class="w-3.5 h-3.5" /> {{ t('projects.addApps') }}
            </Button>
          </div>
          <div v-if="project?.apps?.length" class="space-y-2">
            <div
              v-for="app in project.apps"
              :key="app.identifier"
              class="flex items-center justify-between rounded-lg border p-3 hover:bg-accent cursor-pointer transition-colors group"
              @click="router.push(`/apps/${app.identifier}`)"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">{{ app.name }}</p>
                <p v-if="app.description" class="text-xs text-muted-foreground truncate">{{ descriptionSummary(app.description) }}</p>
              </div>
              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all shrink-0"
                :title="t('projects.removeFromProject')"
                @click.stop="unassignApp(app.identifier)"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('projects.noApps') }}</p>
        </div>
      </div>
    </template>
  </Page>
</template>

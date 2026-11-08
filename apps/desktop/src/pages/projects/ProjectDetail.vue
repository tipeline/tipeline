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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { useQuery } from '@/composables/useQuery';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { renderMarkdown } from '@/utils/appMarkdown';
import { descriptionSummary, fileSlug } from '@tipeline/utils';
import { Pencil, Trash2, Workflow, AppWindow, Plus, X, Link2, Download, BotIcon, EllipsisVertical, Network } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';
import { useAgentStore } from '@/store/agentStore';
import type { TaskItem } from '@/config/tables/TasksList';
import type { AppItem } from '@/config/tables/AppsList';
import { assignToProject } from '@/utils/projectAssign';

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

// The filter box only shows once the list is long enough to need it.
const TASK_FILTER_MIN = 8;
const taskFilter = ref('');
const filteredTasks = computed(() => {
  const tasks = project.value?.tasks ?? [];
  const q = taskFilter.value.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t: any) =>
    [t.name, t.identifier, t.description].some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
  );
});

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
    await assignToProject('task', identifier, taskIdentifier);
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
    await assignToProject('app', identifier, appIdentifier);
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

    <!-- Like a workflow's overview: one main button (Map, like Build) and the rest in a menu -->
    <template v-if="project" #menu>
      <Button as-child>
        <RouterLink :to="{ name: 'ProjectMapEditor', params: { pid: identifier } }">
          <Network class="w-4 h-4" /> {{ t('projects.openMap') }}
        </RouterLink>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon" :aria-label="t('projects.moreActions')">
            <EllipsisVertical class="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem class="cursor-pointer" @click="openNewTaskDialog(identifier)">
            <Plus class="size-4" /> {{ t('tasks.new') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="openNewAppDialog(identifier)">
            <Plus class="size-4" /> {{ t('apps.new') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="cursor-pointer" @click="openEdit = true">
            <Pencil class="size-4" /> {{ t('common.edit') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" :disabled="isExporting" @click="handleExport">
            <Download class="size-4" /> {{ isExporting ? t('projects.exporting') : t('common.export') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="cursor-pointer text-destructive focus:text-destructive" @click="openDelete = true">
            <Trash2 class="size-4" /> {{ t('common.delete') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>

    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('projects.notFound.title')"
        :description="t('projects.notFound.description')"
        :back-label="t('projects.notFound.back')"
        :back-to="{ name: 'Projects' }"
      />
      <div v-else-if="project" class="flex-1 min-h-0 overflow-y-auto scroll-fade p-4 pb-6 space-y-6">
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

        <!-- Apps first: usually only a few, and they would sink under a long workflow list -->
        <section>
          <div class="flex items-center justify-between mb-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <AppWindow class="w-4 h-4" /> {{ t('projects.apps') }}
              <span class="text-xs font-normal text-muted-foreground">{{ project.apps?.length ?? 0 }}</span>
            </h3>
            <Button variant="outline" size="sm" @click="openAddApps = true">
              <Plus class="w-3.5 h-3.5" /> {{ t('projects.addApps') }}
            </Button>
          </div>
          <div v-if="project.apps?.length" class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
            <div
              v-for="app in project.apps"
              :key="app.identifier"
              class="group relative flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
              @click="router.push(`/apps/${app.identifier}`)"
            >
              <p class="flex items-center gap-1.5 pr-5 text-sm font-medium min-w-0">
                <AppWindow class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ app.name }}</span>
              </p>
              <p v-if="app.description" class="text-xs text-muted-foreground line-clamp-2">{{ descriptionSummary(app.description) }}</p>
              <button
                type="button"
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                :title="t('projects.removeFromProject')"
                @click.stop="unassignApp(app.identifier)"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-sm text-muted-foreground">{{ t('projects.noApps') }}</p>
        </section>

        <section>
          <div class="flex items-center justify-between gap-2 mb-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold shrink-0">
              <Workflow class="w-4 h-4" /> {{ t('projects.tasks') }}
              <span class="text-xs font-normal text-muted-foreground">{{ project.tasks?.length ?? 0 }}</span>
            </h3>
            <div class="flex items-center gap-2 min-w-0">
              <Input
                v-if="(project.tasks?.length ?? 0) > TASK_FILTER_MIN"
                v-model="taskFilter"
                :placeholder="t('tasks.searchPlaceholder')"
                class="h-8 w-56 min-w-0"
              />
              <Button variant="outline" size="sm" @click="openAddTasks = true">
                <Plus class="w-3.5 h-3.5" /> {{ t('projects.addTasks') }}
              </Button>
            </div>
          </div>
          <div v-if="filteredTasks.length" class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
            <div
              v-for="task in filteredTasks"
              :key="task.identifier"
              class="group relative flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
              @click="router.push(`/tasks/${task.identifier}`)"
            >
              <p class="flex items-center gap-1.5 pr-5 text-sm font-medium min-w-0">
                <Workflow class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ task.name }}</span>
              </p>
              <p v-if="task.description" class="text-xs text-muted-foreground line-clamp-2">{{ descriptionSummary(task.description) }}</p>
              <button
                type="button"
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                :title="t('projects.removeFromProject')"
                @click.stop="unassignTask(task.identifier)"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <p v-else-if="project.tasks?.length" class="text-sm text-muted-foreground">{{ t('common.noResults') }}</p>
          <p v-else class="text-sm text-muted-foreground">{{ t('projects.noTasks') }}</p>
        </section>

        <!-- Workflows this project's apps use that live elsewhere: shown, not assigned -->
        <section v-if="project.shared_tasks?.length">
          <div class="mb-2">
            <h3 class="flex items-center gap-2 text-sm font-semibold">
              <Link2 class="w-4 h-4" /> {{ t('projects.sharedTasks') }}
              <span class="text-xs font-normal text-muted-foreground">{{ project.shared_tasks.length }}</span>
            </h3>
            <p class="text-xs text-muted-foreground mt-1">{{ t('projects.sharedTasksHint') }}</p>
          </div>
          <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
            <div
              v-for="task in project.shared_tasks"
              :key="task.identifier"
              class="flex flex-col gap-1 rounded-lg border border-dashed px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
              @click="router.push(`/tasks/${task.identifier}`)"
            >
              <p class="flex items-center gap-1.5 text-sm font-medium min-w-0">
                <Workflow class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span class="truncate">{{ task.name }}</span>
              </p>
              <p class="text-xs text-muted-foreground line-clamp-2">
                {{ t('projects.usedByApps', { apps: task.apps.map((a: any) => a.name).join(', ') }) }}
              </p>
              <button
                v-if="task.project_identifier"
                type="button"
                class="inline-flex items-center gap-1.5 self-start max-w-full px-2 py-0.5 rounded border text-xs hover:bg-background transition-colors"
                @click.stop="router.push(`/projects/${task.project_identifier}`)"
              >
                <span
                  v-if="task.project_color"
                  class="w-2 h-2 rounded-full shrink-0"
                  :style="{ backgroundColor: task.project_color }"
                />
                <span class="truncate">{{ task.project_name }}</span>
              </button>
              <span v-else class="text-xs text-muted-foreground">{{ t('projects.noProject') }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </Page>
</template>

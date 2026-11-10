<script setup lang="ts">
interface Task {
  id: string;
  name: string;
  description?: string;
  status?: string;
  /** Every project it's in. */
  projects?: { identifier: string; name: string; color: string | null }[];
  [key: string]: any;
}
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import Page from '@/components/Page.vue';
import NotFoundState from '@/components/NotFoundState.vue';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@/composables/useQuery';
import { useTaskStore } from '@/store/task';
import { useRecentItemsStore } from '@/store/recentItems';
import StarButton from '@/components/StarButton.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import Dialog from '@/components/Dialog.vue';
import ImageUploadField from '@/components/forms/ImageUploadField.vue';
import StepCacheField from '@/components/task/StepCacheField.vue';
import { Switch } from '@/components/ui/switch';
import { uncacheableSteps } from '@tipeline/schemas';
import { usePluginStore } from '@/store/pluginStore';
import { Edit, DownloadIcon, Settings2, Trash2, EllipsisVertical, Workflow, Copy } from 'lucide-vue-next';
import { toAssetUrl } from '@/utils/assetUrl';
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
import WorkflowUsageWarning from '@/components/task/WorkflowUsageWarning.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import TagsField from '@/components/tag/TagsField.vue';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { fileSlug } from '@tipeline/utils';
import { deleteWorkflow } from '@/utils/deleteWorkflow';
import { showTrashedToast } from '@/utils/trash';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { beautifyObjectName } from '@/components/ui/auto-form/utils';
import { dump } from 'js-yaml';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';
import { projectIdsOf, setProjects } from '@/utils/projectAssign';
import ProjectSelect from '@/components/project/ProjectSelect.vue';

const PLATFORM_OPTIONS = ['windows', 'linux', 'macos'] as const;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const taskStore = useTaskStore();
const recentItemsStore = useRecentItemsStore();

const { data: task, isLoading, refetch } = useQuery<Task>(SEND.TASK_DETAIL, {
  identifier: route.params.tid,
});
const notFound = computed(() => !isLoading.value && !task.value);

const ROUTE_TO_TAB: Record<string, string> = {
  PipelineDetail: 'TaskHistory',
};

// A plain writable computed (rather than a ref kept in sync via two watchers)
// so there's a single source of truth: the active tab always derives directly
// from the current route, with no separate state that can drift out of sync.
const tab = computed({
  get: () => {
    const name = route.name;
    return typeof name === 'string' ? (ROUTE_TO_TAB[name] ?? name) : 'TaskOverview';
  },
  set: (newTab) => {
    if (newTab !== route.name) {
      router.push({ name: newTab, params: { tid: route.params.tid } });
    }
  },
});

watch(
  () => route.params.tid,
  (newTid, oldTid) => {
    if (newTid !== oldTid) {
      refetch({ identifier: newTid });
    }
  }
);

watch(task, (newTask) => {
  if (newTask) {
    taskStore.setTask(newTask);
    recentItemsStore.markOpened('task', newTask.identifier, newTask.name, newTask.metadata?.image);
  }
}, { immediate: true });

const openEditMeta = ref(false);
const editProjects = ref<string[]>([]);
const editTags = ref<string[]>([]);
// The workflow cache TTL ('' = off), and what was there when the dialog opened (with
// any `inputs` written in YAML, which the dialog keeps).
const editCacheTtl = ref('');
const pluginStore = usePluginStore();
const parsedSource = computed(() => {
  try {
    return task.value?.source ? JSON.parse(task.value.source) : null;
  } catch {
    return null;
  }
});
const savedCache = computed(() => parsedSource.value?.cache ?? null);
const editHelper = ref(false);
// Steps that stop this workflow from being cached (a cache hit would skip them).
const cacheBlockers = computed(() =>
  uncacheableSteps(parsedSource.value?.pipeline?.actions ?? [], (group, name) =>
    pluginStore.isActionCacheable(group, name)
  )
);
const editImage = ref<string | null>(null);
const isSavingMeta = ref(false);

const taskImageUrl = computed(() => toAssetUrl(task.value?.metadata?.image));


const { translateError } = useErrorT();

const { handleSubmit: handleMetaSubmit, setValues: setMetaValues } = useForm({
  validationSchema: toTypedSchema(
    z.object({
      name: z.string().min(1, 'task.name.required'),
      description: z.string().optional(),
      author: z.string().optional(),
      version: z
        .string()
        .refine((v) => !v || /^\d+\.\d+\.\d+$/.test(v), 'task.version.format')
        .optional(),
      platform: z.enum(PLATFORM_OPTIONS).optional(),
    })
  ),
});

function handleOpenEditMeta() {
  if (!task.value) return;
  setMetaValues({
    name: task.value.name ?? '',
    description: task.value.description ?? '',
    author: task.value.author ?? '',
    version: task.value.version ?? '',
    platform: task.value.platform ?? undefined,
  });
  editProjects.value = projectIdsOf(task.value);
  editImage.value = task.value.metadata?.image ?? null;
  const raw = task.value.tags;
  editTags.value = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? [...raw] : []);
  editCacheTtl.value = savedCache.value?.ttl != null ? String(savedCache.value.ttl) : '';
  editHelper.value = parsedSource.value?.helper === true;
  // Plugin steps count as cacheable only when their plugin says so.
  if ((parsedSource.value?.pipeline?.actions ?? []).some((a: any) => a?.source === 'plugin')) {
    invokeCore(SEND.PLUGIN_LIST)
      .then((plugins: any[]) => plugins?.forEach((p) => pluginStore.registerCacheable(p.group, p.cacheable)))
      .catch(() => {});
  }
  openEditMeta.value = true;
}

// Sent only when the setting changed: turning it off, or a new TTL (keeping `inputs`).
function cacheChange(): { cache?: Record<string, unknown> | null } {
  const before = savedCache.value?.ttl != null ? String(savedCache.value.ttl) : '';
  if (editCacheTtl.value === before) return {};
  if (!editCacheTtl.value) return { cache: null };
  return { cache: { ...(savedCache.value ?? {}), ttl: editCacheTtl.value } };
}

const saveEditMeta = handleMetaSubmit(
  async (values) => {
    if (!task.value) return;
    isSavingMeta.value = true;
    try {
      await invokeCore(SEND.TASK_UPDATE_META, {
        identifier: task.value.identifier,
        name: values.name,
        description: values.description || undefined,
        author: values.author || undefined,
        version: values.version || undefined,
        platform: values.platform || undefined,
        tags: [...editTags.value],
        ...cacheChange(),
        helper: editHelper.value,
      });

      await setProjects('task', task.value.identifier, projectIdsOf(task.value), editProjects.value);

      await refetch({ identifier: task.value.identifier });
      openEditMeta.value = false;
    } catch (e: any) {
      toast.error(t('tasks.saveFailed'), { description: translateError(e?.message ?? String(e)) });
    } finally {
      isSavingMeta.value = false;
    }
  },
  () => {
    toast.error(t('tasks.saveFailed'), { description: t('tasks.form.fixErrorsBeforeSaving') });
  }
);

const openDelete = ref(false);
const isDeleting = ref(false);

async function confirmDeleteTask() {
  if (!task.value) return;
  isDeleting.value = true;
  try {
    const { identifier, name } = task.value;
    const trashId = await deleteWorkflow(identifier);
    openDelete.value = false;
    showTrashedToast('task', name, trashId, () => router.push({ name: 'TaskOverview', params: { tid: identifier } }));
    router.push({ name: 'Tasks' });
  } catch (e: any) {
    toast.error(t('tasks.deleteFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDeleting.value = false;
  }
}

const duplicateOpen = ref(false);
const isDuplicating = ref(false);
const duplicateName = ref('');

function openDuplicate() {
  if (!task.value) return;
  duplicateName.value = `${task.value.name} (${t('tasks.copySuffix')})`;
  duplicateOpen.value = true;
}

async function confirmDuplicate() {
  if (!task.value || !duplicateName.value.trim()) return;
  isDuplicating.value = true;
  try {
    const copy = await invokeCore(SEND.TASK_DUPLICATE, {
      identifier: task.value.identifier,
      name: duplicateName.value,
    });
    duplicateOpen.value = false;
    router.push({ name: 'TaskOverview', params: { tid: copy.identifier } });
  } catch (e: any) {
    toast.error(t('tasks.duplicateFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDuplicating.value = false;
  }
}

async function exportTask() {
  if (!task.value?.source) return;
  const parsed = JSON.parse(task.value.source);
  const yaml = dump(parsed, { lineWidth: -1 });
  await window.ipcRenderer.invoke('dialog:save-file', {
    defaultPath: `${fileSlug(task.value.name, 'workflow')}.yml`,
    content: yaml,
    filters: [{ name: 'YAML Files', extensions: ['yml', 'yaml'] }],
  });
}

useKeyboardShortcuts([
  {
    key: 'i',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => !!task.value),
    handler: () => handleOpenEditMeta(),
  },
  {
    key: 'e',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => !!task.value?.source),
    handler: () => exportTask(),
  },
  {
    key: 'b',
    meta: true,
    skipWhenEditable: true,
    enabled: computed(() => !!task.value),
    handler: () => {
      if (!task.value) return;
      router.push({ name: 'TaskEdit', params: { tid: task.value.identifier } });
    },
  },
]);
</script>

<template>
  <Dialog v-model="openEditMeta" :title="t('tasks.editDialog.title')" :description="t('tasks.editDialog.description')">
    <form class="space-y-4" @submit.prevent="saveEditMeta">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.image') }}</label>
        <ImageUploadField
          v-if="task"
          kind="task"
          :identifier="task.identifier"
          v-model="editImage"
          :placeholder-icon="Workflow"
          @update:model-value="refetch({ identifier: task.identifier })"
        />
      </div>

      <FormField name="name" v-slot="{ componentField }">
        <FormItem>
          <FormLabel>{{ t('tasks.form.name') }}</FormLabel>
          <FormControl>
            <Input :placeholder="t('tasks.form.namePlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField name="description" v-slot="{ componentField }">
        <FormItem>
          <FormLabel>{{ t('tasks.form.description') }}</FormLabel>
          <FormControl>
            <MarkdownTextarea
              :placeholder="t('tasks.form.descriptionPlaceholder')"
              rows="3"
              class="max-h-40 overflow-y-auto"
              v-bind="componentField"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="grid grid-cols-2 gap-4 items-start">
        <FormField name="author" v-slot="{ componentField }">
          <FormItem>
            <FormLabel>{{ t('tasks.form.author') }}</FormLabel>
            <FormControl>
              <Input :placeholder="t('tasks.form.authorPlaceholder')" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField name="version" v-slot="{ componentField }">
          <FormItem>
            <FormLabel>{{ t('tasks.form.version') }}</FormLabel>
            <FormControl>
              <Input :placeholder="t('tasks.form.versionPlaceholder')" v-bind="componentField" />
            </FormControl>
            <p class="text-xs text-muted-foreground">{{ t('tasks.form.versionHint') }}</p>
            <FormMessage />
          </FormItem>
        </FormField>
      </div>

      <FormField name="platform" v-slot="{ componentField }">
        <FormItem>
          <FormLabel>{{ t('common.platform') }} <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span></FormLabel>
          <Select v-bind="componentField">
            <FormControl>
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('tasks.form.platformPlaceholder')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem v-for="option in PLATFORM_OPTIONS" :key="option" :value="option">
                {{ beautifyObjectName(option) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      </FormField>

      <ProjectSelect v-model="editProjects" />

      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.tags') }}</label>
        <TagsField v-model="editTags" :placeholder="t('tasks.form.tagPlaceholder')" />
      </div>

      <StepCacheField
        v-if="!cacheBlockers.length || editCacheTtl"
        v-model="editCacheTtl"
        :label="t('cache.workflowLabel')"
        :hint="t('cache.workflowHint')"
      />
      <div v-else class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('cache.workflowLabel') }}</label>
        <p class="text-xs text-muted-foreground">
          {{ t('cache.workflowBlocked', { steps: cacheBlockers.join(', ') }) }}
        </p>
      </div>

      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <label for="edit-helper" class="text-sm font-medium">{{ t('tasks.helper.label') }}</label>
          <p class="text-xs text-muted-foreground">{{ t('tasks.helper.hint') }}</p>
        </div>
        <Switch id="edit-helper" v-model="editHelper" class="mt-0.5 shrink-0" />
      </div>

      <div class="pt-2">
        <Button type="submit" :disabled="isSavingMeta">
          {{ isSavingMeta ? t('common.saving') : t('common.save') }}
        </Button>
      </div>
    </form>
  </Dialog>

  <Dialog
    v-model="duplicateOpen"
    :title="t('tasks.duplicateDialog.title')"
    :description="t('tasks.duplicateDialog.description', { name: task?.name })"
  >
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.name') }}</label>
        <Input
          v-model="duplicateName"
          :placeholder="t('tasks.duplicateDialog.namePlaceholder')"
          @keydown.enter="confirmDuplicate"
        />
      </div>
    </div>

    <template #footer>
      <Button :disabled="isDuplicating || !duplicateName.trim()" @click="confirmDuplicate">
        {{ isDuplicating ? t('tasks.duplicating') : t('tasks.duplicate') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="openDelete">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tasks.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tasks.deleteAlert.description', { name: task?.name }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <WorkflowUsageWarning :identifier="openDelete ? (task?.identifier ?? null) : null" />
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="isDeleting"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="confirmDeleteTask"
        >
          {{ isDeleting ? t('common.deleting') : t('common.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>
      <div v-if="task" class="flex items-center gap-2">
        <div class="size-6 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          <img v-if="taskImageUrl" :src="taskImageUrl" class="w-full h-full object-cover" />
          <Workflow v-else class="size-3.5 text-muted-foreground/50" />
        </div>
        <span>{{ task.name }}</span>
      </div>
    </template>

    <template #menu>
      <StarButton
        v-if="task"
        variant="button"
        type="task"
        :identifier="task.identifier"
        :name="task.name"
        :image="task.metadata?.image"
      />
      <Button as-child type="submit">
        <RouterLink
          v-if="task"
          :to="{ name: 'TaskEdit', params: { tid: task.identifier } }"
        >
          <Edit class="w-4 h-4" />
          {{ t('common.build') }}
          <kbd
            class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 font-mono text-[10px] font-medium text-primary-foreground opacity-100"
          >
            <span class="text-xs">⌘</span>B
          </kbd>
        </RouterLink>
      </Button>
      <DropdownMenu v-if="task">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon">
            <EllipsisVertical class="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem class="cursor-pointer" @click="handleOpenEditMeta">
            <Settings2 class="size-4" />
            {{ t('tasks.editInfo') }}
            <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="exportTask">
            <DownloadIcon class="size-4" />
            {{ t('common.export') }}
            <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem class="cursor-pointer" @click="openDuplicate">
            <Copy class="size-4" />
            {{ t('tasks.duplicate') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="cursor-pointer text-destructive focus:text-destructive" @click="openDelete = true">
            <Trash2 class="size-4" />
            {{ t('common.delete') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </template>

    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('tasks.notFound.title')"
        :description="t('tasks.notFound.description')"
        :back-label="t('tasks.notFound.back')"
        :back-to="{ name: 'Tasks' }"
        :icon="Workflow"
      />
      <Tabs v-else v-model="tab" class="mb-6">
        <TabsList>
          <TabsTrigger value="TaskOverview">{{ t('tasks.tabOverview') }}</TabsTrigger>
          <TabsTrigger value="TaskHistory">{{ t('tasks.tabRuns') }}</TabsTrigger>
          <TabsTrigger value="TaskVersions">{{ t('tasks.tabVersions') }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div v-if="task" class="flex-1 overflow-y-hidden">
        <RouterView v-slot="{ Component }">
          <component
            :is="Component"
            :key="route.fullPath"
            :task="task"
            @updated="refetch({ identifier: task.identifier })"
          />
        </RouterView>
      </div>
    </template>
  </Page>
</template>

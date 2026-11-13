<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
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
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Dialog from '@/components/Dialog.vue';
import ImageUploadField from '@/components/forms/ImageUploadField.vue';
import { Hammer, Trash, Settings2, Copy, Workflow } from 'lucide-vue-next';
import TagsField from '@/components/tag/TagsField.vue';
import { invokeCore } from '@/utils/invoke';
import { deleteWorkflow } from '@/utils/deleteWorkflow';
import { showTrashedToast } from '@/utils/trash';
import StarButton from '@/components/StarButton.vue';
import { SEND } from '@/ipc-channels';
import { useQuery } from '@/composables/useQuery';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { beautifyObjectName } from '@/components/ui/auto-form/utils';
import { projectIdsOf, setProjects, type ProjectTag } from '@/utils/projectAssign';
import ProjectSelect from '@/components/project/ProjectSelect.vue';

const PLATFORM_OPTIONS = ['windows', 'linux', 'macos'] as const;

const props = defineProps<{
  item: {
    identifier: string;
    name: string;
    description?: string | null;
    author?: string | null;
    version?: string | null;
    platform?: string | null;
    tags?: string[];
    projects?: ProjectTag[];
    source_type?: 'local' | 'hub';
    image?: string | null;
  };
  onDeleted?: () => void;
  onUpdated?: () => void;
}>();

const router = useRouter();
const { t } = useI18n();
const { translateError } = useErrorT();
const deleteDialogOpen = ref(false);
const isDeleting = ref(false);
const editOpen = ref(false);
const isSaving = ref(false);
const editForm = ref({ name: '', description: '', author: '', version: '', platform: '' });
const editImage = ref<string | null>(null);
const selectedProjects = ref<string[]>([]);
const editTags = ref<string[]>([]);
const duplicateOpen = ref(false);
const isDuplicating = ref(false);
const duplicateName = ref('');


function openEdit() {
  editForm.value = {
    name: props.item.name ?? '',
    description: props.item.description ?? '',
    author: props.item.author ?? '',
    version: props.item.version ?? '',
    platform: props.item.platform ?? '',
  };
  editImage.value = props.item.image ?? null;
  selectedProjects.value = projectIdsOf(props.item);
  const raw = props.item.tags;
  editTags.value = typeof raw === 'string' ? JSON.parse(raw as any) : (Array.isArray(raw) ? [...raw] : []);
  editOpen.value = true;
}

async function saveEdit() {
  isSaving.value = true;
  try {
    await invokeCore(SEND.TASK_UPDATE_META, { identifier: props.item.identifier, ...editForm.value, tags: [...editTags.value] });

    await setProjects('task', props.item.identifier, projectIdsOf(props.item), selectedProjects.value);

    editOpen.value = false;
    props.onUpdated?.();
  } catch (e: any) {
    toast.error(t('tasks.saveFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  isDeleting.value = true;
  try {
    const trashId = await deleteWorkflow(props.item.identifier);
    deleteDialogOpen.value = false;
    showTrashedToast('task', props.item.name, trashId, props.onUpdated ?? props.onDeleted);
    props.onDeleted?.();
  } catch (e: any) {
    toast.error(t('tasks.deleteFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDeleting.value = false;
  }
}

function openDuplicate() {
  duplicateName.value = `${props.item.name} (${t('tasks.copySuffix')})`;
  duplicateOpen.value = true;
}

async function confirmDuplicate() {
  isDuplicating.value = true;
  try {
    await invokeCore(SEND.TASK_DUPLICATE, {
      identifier: props.item.identifier,
      name: duplicateName.value,
    });
    duplicateOpen.value = false;
    props.onUpdated?.();
  } catch (e: any) {
    toast.error(t('tasks.duplicateFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDuplicating.value = false;
  }
}
</script>

<template>
  <Dialog v-model="editOpen" :title="t('tasks.editDialog.title')" :description="t('tasks.editDialog.description')">
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.image') }}</label>
        <ImageUploadField
          kind="task"
          :identifier="item.identifier"
          v-model="editImage"
          :placeholder-icon="Workflow"
          @update:model-value="onUpdated?.()"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.name') }}</label>
        <Input v-model="editForm.name" :placeholder="t('tasks.form.namePlaceholder')" />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.description') }}</label>
        <MarkdownTextarea v-model="editForm.description" :placeholder="t('tasks.form.descriptionPlaceholder')" rows="3" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('tasks.form.author') }}</label>
          <Input v-model="editForm.author" :placeholder="t('tasks.form.authorPlaceholder')" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('tasks.form.version') }}</label>
          <Input
            v-model="editForm.version"
            :disabled="item.source_type === 'hub'"
            :placeholder="t('tasks.form.versionPlaceholder')"
          />
          <p v-if="item.source_type === 'hub'" class="text-xs text-muted-foreground">
            {{ t('tasks.form.versionHubManaged') }}
          </p>
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('common.platform') }} <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span></label>
        <Select v-model="editForm.platform">
          <SelectTrigger>
            <SelectValue :placeholder="t('tasks.form.platformPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in PLATFORM_OPTIONS" :key="option" :value="option">
              {{ beautifyObjectName(option) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ProjectSelect v-model="selectedProjects" />
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('tasks.form.tags') }}</label>
        <TagsField v-model="editTags" :placeholder="t('tasks.form.tagPlaceholder')" />
      </div>
    </div>

    <template #footer>
      <Button :disabled="isSaving" @click="saveEdit">
        {{ isSaving ? t('common.saving') : t('common.save') }}
      </Button>
    </template>
  </Dialog>

  <Dialog
    v-model="duplicateOpen"
    :title="t('tasks.duplicateDialog.title')"
    :description="t('tasks.duplicateDialog.description', { name: item.name })"
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

  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tasks.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tasks.deleteAlert.description', { name: item.name }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <WorkflowUsageWarning :identifier="deleteDialogOpen ? item.identifier : null" />
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="isDeleting"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click.prevent="confirmDelete"
        >
          {{ isDeleting ? t('common.deleting') : t('common.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <div class="flex items-center gap-1">
    <StarButton type="task" :identifier="item.identifier" :name="item.name" :image="item.image" />
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('tasks.editInfo')"
      @click="openEdit"
    >
      <Settings2 class="size-4" />
    </button>
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('common.build')"
      @click="router.push(`/tasks/${item.identifier}/edit`)"
    >
      <Hammer class="size-4" />
    </button>
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('tasks.duplicate')"
      @click="openDuplicate"
    >
      <Copy class="size-4" />
    </button>
    <button
      class="p-1 hover:bg-accent rounded transition-colors text-destructive"
      :title="t('common.delete')"
      @click="deleteDialogOpen = true"
    >
      <Trash class="size-4" />
    </button>
  </div>
</template>

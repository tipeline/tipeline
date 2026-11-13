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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import Dialog from '@/components/Dialog.vue';
import ImageUploadField from '@/components/forms/ImageUploadField.vue';
import { Hammer, Trash, Settings2, AppWindow, ExternalLink } from 'lucide-vue-next';
import { openInWindow, windowPaths } from '@/utils/detachedWindows';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useQuery } from '@/composables/useQuery';
import { projectIdsOf, setProjects, type ProjectTag } from '@/utils/projectAssign';
import ProjectSelect from '@/components/project/ProjectSelect.vue';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { deleteApp } from '@/utils/deleteApp';
import { showTrashedToast } from '@/utils/trash';
import StarButton from '@/components/StarButton.vue';

const props = defineProps<{
  item: {
    identifier: string;
    name: string;
    description?: string | null;
    author?: string | null;
    version?: string | null;
    projects?: ProjectTag[];
    image?: string | null;
  };
  onDeleted?: () => void;
  onUpdated?: () => void;
}>();

const emit = defineEmits<{ deleted: [] }>();

const router = useRouter();
const { t } = useI18n();
const { translateError } = useErrorT();
const deleteDialogOpen = ref(false);
const isDeleting = ref(false);
const editOpen = ref(false);
const isSaving = ref(false);
const editForm = ref({ name: '', description: '', author: '', version: '' });
const editImage = ref<string | null>(null);
const selectedProjects = ref<string[]>([]);


function openEdit() {
  editForm.value = {
    name: props.item.name ?? '',
    description: props.item.description ?? '',
    author: props.item.author ?? '',
    version: props.item.version ?? '',
  };
  editImage.value = props.item.image ?? null;
  selectedProjects.value = projectIdsOf(props.item);
  editOpen.value = true;
}

async function saveEdit() {
  isSaving.value = true;
  try {
    await invokeCore(SEND.APP_UPDATE_META, { identifier: props.item.identifier, ...editForm.value });

    await setProjects('app', props.item.identifier, projectIdsOf(props.item), selectedProjects.value);
    editOpen.value = false;
    props.onUpdated?.();
  } catch (e: any) {
    toast.error(t('apps.saveFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  isDeleting.value = true;
  try {
    const trashId = await deleteApp(props.item.identifier);
    deleteDialogOpen.value = false;
    showTrashedToast('app', props.item.name, trashId, props.onUpdated ?? props.onDeleted);
    emit('deleted');
    props.onDeleted?.();
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="editOpen" :title="t('apps.editDialog.title')" :description="t('apps.editDialog.description')">
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.image') }}</label>
        <ImageUploadField
          kind="app"
          :identifier="item.identifier"
          v-model="editImage"
          :placeholder-icon="AppWindow"
          @update:model-value="onUpdated?.()"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.name') }}</label>
        <Input v-model="editForm.name" :placeholder="t('apps.form.namePlaceholder')" />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('apps.form.description') }}</label>
        <MarkdownTextarea v-model="editForm.description" :placeholder="t('apps.form.descriptionPlaceholder')" rows="3" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('apps.form.author') }}</label>
          <Input v-model="editForm.author" :placeholder="t('apps.form.authorPlaceholder')" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('apps.form.version') }}</label>
          <Input v-model="editForm.version" :placeholder="t('apps.form.versionPlaceholder')" />
        </div>
      </div>
      <ProjectSelect v-model="selectedProjects" />
    </div>

    <template #footer>
      <Button :disabled="isSaving" @click="saveEdit">
        {{ isSaving ? t('common.saving') : t('common.save') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="deleteDialogOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('apps.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('apps.deleteAlert.description', { name: item.name }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
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
    <StarButton type="app" :identifier="item.identifier" :name="item.name" :image="item.image" />
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('common.openInWindow')"
      @click="openInWindow(windowPaths.app(item.identifier), item.name)"
    >
      <ExternalLink class="size-4" />
    </button>
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('common.edit')"
      @click="openEdit"
    >
      <Settings2 class="size-4" />
    </button>
    <button
      class="p-1 hover:bg-accent rounded transition-colors"
      :title="t('common.build')"
      @click="router.push(`/apps/${item.identifier}/edit`)"
    >
      <Hammer class="size-4" />
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

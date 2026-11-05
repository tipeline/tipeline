<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import Page from '@/components/Page.vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useQuery } from '@/composables/useQuery';
import { invokeCore } from '@/utils/invoke';
import Button from '@/components/ui/button/Button.vue';
import { Plus } from 'lucide-vue-next';
import { SEND } from '@/ipc-channels';
import Dialog from '@/components/Dialog.vue';
import TagForm from '@/components/tag/TagForm.vue';
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
import { createColumns, type TagItem } from '@/config/tables/TagsList';

const { t } = useI18n();
const router = useRouter();

type TagFormInstance = InstanceType<typeof TagForm>;

const selectedTag = ref<TagItem | undefined>();
const newFormRef = ref<TagFormInstance | null>(null);
const editFormRef = ref<TagFormInstance | null>(null);
const openNew = ref(false);
const openEdit = ref(false);
const openDelete = ref(false);
const tagToDelete = ref<TagItem | null>(null);

const { data: result, refetch: refetchTags } = useQuery<TagItem[]>(SEND.TAG_LIST);

const columns = computed<ColumnDef<TagItem>[]>(() => createColumns(t, handleEdit, handleDelete, handleOpen));

function handleNewTag() {
  openNew.value = true;
}

function handleClose() {
  refetchTags();
  openNew.value = openEdit.value = false;
}

const handleEdit = (item: TagItem) => {
  selectedTag.value = item;
  openEdit.value = true;
};

const handleOpen = (item: TagItem) => {
  router.push({ path: '/tasks', query: { tags: item.label } });
};

const handleDelete = (item: TagItem) => {
  tagToDelete.value = item;
  openDelete.value = true;
};

const confirmDelete = async () => {
  if (!tagToDelete.value) return;
  await invokeCore(SEND.TAG_DELETE, { id: tagToDelete.value.id });
  openDelete.value = false;
  tagToDelete.value = null;
  refetchTags();
};
</script>

<template>
  <Dialog v-model="openNew" :title="t('tag.newDialog.title')" :description="t('tag.newDialog.description')">
    <TagForm ref="newFormRef" @close="handleClose" mode="create" />

    <template #footer>
      <Button :disabled="newFormRef?.isSaving" @click="newFormRef?.submit()">
        {{ t('tag.form.create') }}
      </Button>
    </template>
  </Dialog>

  <Dialog v-model="openEdit" :title="t('tag.editDialog.title')" :description="t('tag.editDialog.description')">
    <TagForm ref="editFormRef" @close="handleClose" mode="edit" :initialData="selectedTag" />

    <template #footer>
      <Button :disabled="editFormRef?.isSaving" @click="editFormRef?.submit()">
        {{ t('tag.saveChanges') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="openDelete">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tag.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tag.deleteAlert.description', { label: tagToDelete?.label }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('tag.deleteAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          @click="confirmDelete"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t('tag.deleteAlert.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>{{ t('tag.title') }}</template>
    <template #menu>
      <Button @click="handleNewTag">
        <Plus class="w-4 h-4" /> {{ t('tag.new') }}
      </Button>
    </template>
    <template #content>
      <Card classContent="p-0" class="h-full">
        <template #content>
          <DataTable
            :columns="columns"
            :data="result ?? []"
            :flat="true"
            :filters="[{ column: 'label', placeholder: t('tag.searchPlaceholder') }]"
          />
        </template>
      </Card>
    </template>
  </Page>
</template>

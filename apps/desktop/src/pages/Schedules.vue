<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
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
import { createColumns, type ScheduleItem } from '@/config/tables/SchedulesList';
import { useScheduleText } from '@/composables/useScheduleText';
import { toast } from '@/components/ui/sonner';
import SelectionBar from '@/components/SelectionBar.vue';
import BulkDeleteDialog from '@/components/BulkDeleteDialog.vue';
import { deleteEach, type BulkDeleteItem } from '@/utils/bulkDelete';

const { t } = useI18n();
const scheduleText = useScheduleText();

type ScheduleFormInstance = InstanceType<typeof ScheduleForm>;

const selectedSchedule = ref<ScheduleItem | null>(null);
const newFormRef = ref<ScheduleFormInstance | null>(null);
const editFormRef = ref<ScheduleFormInstance | null>(null);
const openNew = ref(false);
const openEdit = ref(false);
const openDelete = ref(false);
const scheduleToDelete = ref<ScheduleItem | null>(null);

const { data: result, refetch: refetchSchedules } = useQuery<ScheduleItem[]>(SEND.SCHEDULE_LIST);

const columns = computed<ColumnDef<ScheduleItem>[]>(() =>
  createColumns(t, scheduleText, handleEdit, handleDelete, handleToggle)
);

function handleClose() {
  refetchSchedules();
  openNew.value = openEdit.value = false;
}

const handleEdit = (item: ScheduleItem) => {
  selectedSchedule.value = item;
  openEdit.value = true;
};

const handleDelete = (item: ScheduleItem) => {
  scheduleToDelete.value = item;
  openDelete.value = true;
};

const handleToggle = async (item: ScheduleItem) => {
  try {
    await invokeCore(SEND.SCHEDULE_TOGGLE, {
      scheduleIdentifier: item.scheduleIdentifier,
      enabled: !item.enabled,
    });
  } catch (error: any) {
    toast.error(t('schedules.toggleFailed'), { description: error?.message ?? String(error) });
  }
  refetchSchedules();
};

const selection = ref<string[]>([]);
const bulkDeleteOpen = ref(false);
const selectedItems = computed<BulkDeleteItem[]>(() =>
  (result.value ?? [])
    .filter((item) => selection.value.includes(item.scheduleIdentifier))
    .map((item) => ({ key: item.scheduleIdentifier, name: `${item.taskName} · ${scheduleText.describe(item)}` }))
);
const removeSchedules = (items: BulkDeleteItem[]) =>
  deleteEach(
    items,
    (scheduleIdentifier) => invokeCore(SEND.SCHEDULE_REMOVE, { scheduleIdentifier }),
    (message) => message
  );

const confirmDelete = async () => {
  if (!scheduleToDelete.value) return;
  try {
    await invokeCore(SEND.SCHEDULE_REMOVE, {
      scheduleIdentifier: scheduleToDelete.value.scheduleIdentifier,
    });
  } catch (error: any) {
    toast.error(t('schedules.deleteFailed'), { description: error?.message ?? String(error) });
  }
  openDelete.value = false;
  scheduleToDelete.value = null;
  refetchSchedules();
};
</script>

<template>
  <Dialog v-model="openNew" :title="t('schedules.newDialog.title')" :description="t('schedules.newDialog.description')">
    <ScheduleForm ref="newFormRef" @close="handleClose" mode="create" />

    <template #footer>
      <Button :disabled="newFormRef?.saving" @click="newFormRef?.submit()">
        {{ newFormRef?.saving ? t('common.saving') : t('schedules.form.create') }}
      </Button>
    </template>
  </Dialog>

  <Dialog v-model="openEdit" :title="t('schedules.editDialog.title')" :description="t('schedules.editDialog.description')">
    <ScheduleForm
      ref="editFormRef"
      @close="handleClose"
      mode="edit"
      :initialData="selectedSchedule ?? undefined"
    />

    <template #footer>
      <Button :disabled="editFormRef?.saving" @click="editFormRef?.submit()">
        {{ editFormRef?.saving ? t('common.saving') : t('schedules.form.update') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="openDelete">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('schedules.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('schedules.deleteAlert.description', { identifier: scheduleToDelete?.taskIdentifier }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('schedules.deleteAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          @click="confirmDelete"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t('schedules.deleteAlert.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>{{ t('schedules.title') }}</template>
    <template #menu>
      <Button @click="openNew = true">
        <Plus class="w-4 h-4" /> {{ t('schedules.new') }}
      </Button>
    </template>
    <template #content>
      <Card classContent="p-0" class="h-full">
        <template #content>
          <DataTable
            :columns="columns"
            :data="result ?? []"
            :flat="true"
            :filters="[{ column: 'taskIdentifier', placeholder: t('schedules.searchPlaceholder') }]"
            selectable
            :row-key="(item: ScheduleItem) => item.scheduleIdentifier"
            v-model:selection="selection"
          >
            <template #extra-filters>
              <SelectionBar
                v-if="selection.length > 0"
                :count="selection.length"
                @clear="selection = []"
                @delete="bulkDeleteOpen = true"
              />
            </template>
          </DataTable>
        </template>
      </Card>
      <BulkDeleteDialog
        v-model:open="bulkDeleteOpen"
        :items="selectedItems"
        i18n-key="schedules.bulkDelete"
        :remove="removeSchedules"
        @deleted="refetchSchedules()"
      />
    </template>
  </Page>
</template>

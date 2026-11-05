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
import { Plus, Download, Trash2 } from 'lucide-vue-next';
import { SEND } from '@/ipc-channels';
import Dialog from '@/components/Dialog.vue';
import VariableForm from '@/components/variable/VariableForm.vue';
import { Input } from '@/components/ui/input';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { createColumns, type VariableItem } from '@/config/tables/GlobalVariablesList';
import { coreValidations } from '@tipeline/schemas';

const { t } = useI18n();
const { translateError } = useErrorT();
const { variableNameSchema } = coreValidations.varObject;

type VariableFormInstance = InstanceType<typeof VariableForm>;

const selectedVariable = ref<VariableItem | undefined>();
const newFormRef = ref<VariableFormInstance | null>(null);
const editFormRef = ref<VariableFormInstance | null>(null);
const openNew = ref(false);
const openEdit = ref(false);
const openDelete = ref(false);
const variableToDelete = ref<VariableItem | null>(null);
const variableUsages = ref<{ taskIdentifier: string; taskName: string }[]>([]);
const isCheckingUsage = ref(false);
const openExportAll = ref(false);
const exportIncludeSecrets = ref(false);
const isExporting = ref(false);
const openDuplicate = ref(false);
const isDuplicating = ref(false);
const duplicateName = ref('');
const variableToDuplicate = ref<VariableItem | null>(null);

const { data: result, refetch: refetchVariables } = useQuery<VariableItem[]>(SEND.VARIABLE_LIST);

const columns = computed<ColumnDef<VariableItem>[]>(() => createColumns(t, handleEdit, handleDelete, handleDuplicate));

function handleNewVariable() {
  openNew.value = true;
}

function handleClose() {
  refetchVariables();
  openNew.value = openEdit.value = false;
}

const handleEdit = (item: VariableItem) => {
  selectedVariable.value = item;
  openEdit.value = true;
};

const handleDelete = async (item: VariableItem) => {
  variableToDelete.value = item;
  variableUsages.value = [];
  openDelete.value = true;
  isCheckingUsage.value = true;
  try {
    variableUsages.value = await invokeCore(SEND.VARIABLE_USAGE, { name: item.name });
  } catch {
    // A failed check shouldn't block deleting — it just means this dialog
    // falls back to the plain "are you sure" it always showed before.
    variableUsages.value = [];
  } finally {
    isCheckingUsage.value = false;
  }
};

const handleDeleteFromEdit = () => {
  if (!selectedVariable.value) return;
  openEdit.value = false;
  handleDelete(selectedVariable.value);
};

const confirmDelete = async () => {
  if (!variableToDelete.value) return;
  await invokeCore(SEND.VARIABLE_DELETE, { identifier: variableToDelete.value.identifier });
  openDelete.value = false;
  variableToDelete.value = null;
  refetchVariables();
};

function handleDuplicate(item: VariableItem) {
  variableToDuplicate.value = item;
  duplicateName.value = `${item.name}_${t('variable.copySuffix')}`;
  openDuplicate.value = true;
}

const duplicateNameError = computed(() => {
  const result = variableNameSchema.safeParse(duplicateName.value);
  return result.success ? '' : translateError(result.error.issues[0]?.message ?? '');
});

async function confirmDuplicate() {
  if (!variableToDuplicate.value || duplicateNameError.value) return;
  isDuplicating.value = true;
  try {
    await invokeCore(SEND.VARIABLE_DUPLICATE, {
      identifier: variableToDuplicate.value.identifier,
      name: duplicateName.value,
    });
    openDuplicate.value = false;
    refetchVariables();
  } catch (e: any) {
    toast.error(t('variable.duplicateFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDuplicating.value = false;
  }
}

function handleExportAll() {
  exportIncludeSecrets.value = false;
  openExportAll.value = true;
}

const confirmExportAll = async () => {
  const dialogResult = await window.ipcRenderer.invoke('dialog:save-file', {
    defaultPath: `tipeline-globals-export-${Date.now()}.yml`,
    filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }],
  });
  openExportAll.value = false;
  if (!dialogResult?.success) return;
  isExporting.value = true;
  try {
    const result = await invokeCore<{ count: number; secretsRedacted: number }>(SEND.VARIABLE_EXPORT_ALL, {
      targetPath: dialogResult.filePath,
      includeSecrets: exportIncludeSecrets.value,
    });
    toast.success(t('variable.exportAllSuccess', { count: result.count }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('variable.exportFailed'), { description: translateError(msg) });
  } finally {
    isExporting.value = false;
  }
};
</script>

<template>
  <Dialog v-model="openNew" :title="t('variable.newDialog.title')" :description="t('variable.newDialog.description')">
    <VariableForm ref="newFormRef" @close="handleClose" mode="create" />

    <template #footer>
      <Button @click="newFormRef?.submit()">{{ t('variable.form.create') }}</Button>
    </template>
  </Dialog>

  <Dialog v-model="openEdit" :title="t('variable.editDialog.title')" :description="t('variable.editDialog.description')">
    <VariableForm ref="editFormRef" @close="handleClose" mode="edit" :initialData="selectedVariable" />

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <Button @click="editFormRef?.submit()">{{ t('variable.saveChanges') }}</Button>
        <Button
          variant="outline"
          class="ml-auto text-destructive hover:text-destructive"
          @click="handleDeleteFromEdit"
        >
          <Trash2 class="w-4 h-4" /> {{ t('common.delete') }}
        </Button>
      </div>
    </template>
  </Dialog>

  <Dialog
    v-model="openDuplicate"
    :title="t('variable.duplicateDialog.title')"
    :description="t('variable.duplicateDialog.description', { name: variableToDuplicate?.name })"
  >
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('variable.form.name') }}</label>
        <Input
          v-model="duplicateName"
          :placeholder="t('variable.duplicateDialog.namePlaceholder')"
          @keydown.enter="!duplicateNameError && confirmDuplicate()"
        />
        <p v-if="duplicateNameError" class="text-destructive text-sm">{{ duplicateNameError }}</p>
      </div>
    </div>

    <template #footer>
      <Button :disabled="isDuplicating || !duplicateName.trim() || !!duplicateNameError" @click="confirmDuplicate">
        {{ isDuplicating ? t('variable.duplicating') : t('variable.duplicate') }}
      </Button>
    </template>
  </Dialog>

  <AlertDialog v-model:open="openDelete">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('variable.deleteAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription as-child>
          <div class="space-y-2">
            <p>{{ t('variable.deleteAlert.description', { name: variableToDelete?.name }) }}</p>
            <p v-if="isCheckingUsage" class="text-sm text-muted-foreground">
              {{ t('variable.deleteAlert.checkingUsage') }}
            </p>
            <template v-else-if="variableUsages.length > 0">
              <p class="text-sm font-medium text-destructive">
                {{ t('variable.deleteAlert.usageWarning', { count: variableUsages.length }) }}
              </p>
              <ul class="list-disc pl-5 text-sm text-foreground">
                <li v-for="usage in variableUsages" :key="usage.taskIdentifier">{{ usage.taskName }}</li>
              </ul>
            </template>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('variable.deleteAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          @click="confirmDelete"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {{ t('variable.deleteAlert.delete') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog v-model:open="openExportAll">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('variable.exportAllDialog.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('variable.exportAllDialog.description') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex items-center gap-2 text-sm">
        <Checkbox id="variable-export-include-secrets" v-model="exportIncludeSecrets" />
        <label for="variable-export-include-secrets" class="cursor-pointer">
          {{ t('variable.exportAllDialog.includeSecrets') }}
        </label>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('variable.exportAllDialog.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmExportAll">{{ t('variable.exportAllDialog.confirm') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>{{ t('variable.title') }}</template>
    <template #menu>
      <Button variant="outline" :disabled="isExporting" @click="handleExportAll">
        <Download class="w-4 h-4" />
        {{ isExporting ? t('common.exporting') : t('variable.exportAll') }}
      </Button>
      <Button @click="handleNewVariable">
        <Plus class="w-4 h-4" /> {{ t('variable.new') }}
      </Button>
    </template>
    <template #content>
      <Card classContent="p-0" class="h-full">
        <template #content>
          <DataTable
            :columns="columns"
            :data="result ?? []"
            :flat="true"
            :filters="[{ column: 'name', placeholder: t('variable.searchPlaceholder') }]"
          />
        </template>
      </Card>
    </template>
  </Page>
</template>

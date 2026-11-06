<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Globe, FolderOpen, Trash2, RefreshCw, Pencil, KeyRound } from 'lucide-vue-next';
import type { z } from 'zod';
import { coreValidations } from '@tipeline/schemas';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import AutoForm from '@/components/ui/auto-form/AutoForm.vue';
import { DependencyType, type Dependency } from '@/components/ui/auto-form/interface';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { useHubStore, type Hub } from '@/store/hubStore';
import { useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';

const { t } = useI18n();
const { translateError } = useErrorT();
const store = useHubStore();
const autoSave = useAutoSave();

const schema = coreValidations.hubObject.hubSchema;
const fieldConfig = {
  type: {
    optionLabels: {
      remote: t('hub.manage.typeRemote'),
      local_folder: t('hub.manage.typeLocalFolder'),
    },
  },
  target: {
    description: `${t('hub.manage.targetPlaceholderRemote')} — ${t('hub.manage.targetPlaceholderLocalFolder')}`,
  },
  token: {
    label: t('hub.manage.tokenLabel'),
    description: t('hub.manage.tokenDescription'),
    inputProps: { type: 'password', autocomplete: 'off' },
  },
};
// A token only means something for a remote hub.
const dependencies: Dependency<z.infer<typeof schema>>[] = [
  { sourceField: 'type', targetField: 'token', type: DependencyType.HIDES, when: (type) => type !== 'remote' },
];

const showAddDialog = ref(false);
const isSubmitting = ref(false);
const checkingId = ref<string | null>(null);
const removeTarget = ref<Hub | null>(null);
const removing = ref(false);

onMounted(() => store.load());

async function submitAdd(data: any) {
  isSubmitting.value = true;
  try {
    await store.add({ ...data, token: data.type === 'remote' ? data.token : undefined });
    showAddDialog.value = false;
  } finally {
    isSubmitting.value = false;
  }
}

const editTarget = ref<Hub | null>(null);
const editName = ref('');
const editAddress = ref('');
// Empty keeps the saved token; typing replaces it.
const editToken = ref('');
const editRemoveToken = ref(false);
const editSaving = ref(false);

function openEdit(hub: Hub) {
  editTarget.value = hub;
  editName.value = hub.name;
  editAddress.value = hub.target;
  editToken.value = '';
  editRemoveToken.value = false;
}

async function saveEdit() {
  const hub = editTarget.value;
  if (!hub || !editName.value.trim() || !editAddress.value.trim()) return;
  editSaving.value = true;
  try {
    const data: Partial<{ name: string; target: string; token: string | null }> = {
      name: editName.value.trim(),
      target: editAddress.value.trim(),
    };
    if (editRemoveToken.value) data.token = null;
    else if (editToken.value.trim()) data.token = editToken.value.trim();
    await store.update(hub.id, data);
    editTarget.value = null;
  } catch (e: any) {
    toast.error(t('hub.manage.saveFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    editSaving.value = false;
  }
}

function toggleEnabled(hub: Hub, enabled: boolean) {
  void autoSave.save(`enabled:${hub.id}`, () => store.setEnabled(hub.id, enabled));
}

async function checkNow(hub: Hub) {
  checkingId.value = hub.id;
  try {
    await store.checkOne(hub.id);
  } finally {
    checkingId.value = null;
  }
}

async function confirmRemove() {
  if (!removeTarget.value) return;
  removing.value = true;
  try {
    await store.remove(removeTarget.value.id);
    removeTarget.value = null;
  } catch (e: any) {
    toast.error(t('hub.manage.deleteFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <p class="text-sm text-muted-foreground">{{ t('hub.manage.description') }}</p>

    <div class="space-y-2">
      <div
        v-for="hub in store.hubs"
        :key="hub.id"
        class="w-full flex items-center gap-3 p-3 border rounded-lg"
      >
        <Globe v-if="hub.type === 'remote'" class="h-5 w-5 shrink-0 text-blue-500" />
        <FolderOpen v-else class="h-5 w-5 shrink-0 text-amber-500" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 font-medium text-sm">
            {{ hub.name }}
            <span v-if="hub.hasToken" :title="t('hub.manage.hasToken')">
              <KeyRound class="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </div>
          <div class="text-xs text-muted-foreground truncate">{{ hub.target }}</div>
          <div class="text-xs text-muted-foreground">
            {{ t('hub.manage.lastChecked') }}:
            {{ hub.last_checked_at ?? t('hub.manage.never') }}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          :disabled="checkingId === hub.id"
          :title="t('hub.manage.checkNow')"
          @click="checkNow(hub)"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': checkingId === hub.id }" />
        </Button>
        <Button variant="ghost" size="icon" :title="t('hub.manage.edit')" @click="openEdit(hub)">
          <Pencil class="h-4 w-4" />
        </Button>
        <SaveStatus v-bind="autoSave.status(`enabled:${hub.id}`)" />
        <Switch :model-value="!!hub.enabled" @update:model-value="(v: boolean) => toggleEnabled(hub, v)" />
        <Button variant="ghost" size="icon" @click="removeTarget = hub">
          <Trash2 class="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <p v-if="store.hubs.length === 0" class="text-sm text-muted-foreground py-4 text-center">
        {{ t('hub.manage.empty') }}
      </p>
    </div>

    <Button variant="outline" @click="showAddDialog = true">
      <Plus class="h-4 w-4" />
      {{ t('hub.manage.add') }}
    </Button>
  </section>

  <Dialog :open="showAddDialog" @update:open="showAddDialog = $event">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('hub.manage.add') }}</DialogTitle>
      </DialogHeader>
      <AutoForm
        :schema="schema"
        :field-config="fieldConfig"
        :dependencies="dependencies"
        @submit="submitAdd"
        class="space-y-4"
      >
        <Button type="submit" class="w-full" :disabled="isSubmitting">
          {{ t('hub.manage.add') }}
        </Button>
      </AutoForm>
    </DialogContent>
  </Dialog>

  <Dialog :open="!!editTarget" @update:open="(v: boolean) => !v && (editTarget = null)">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t('hub.manage.editTitle') }}</DialogTitle>
        <DialogDescription>{{ t('hub.manage.editDescription') }}</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="saveEdit">
        <div class="space-y-2">
          <Label for="hub-edit-name">{{ t('hub.manage.nameLabel') }}</Label>
          <Input id="hub-edit-name" v-model="editName" />
        </div>
        <div class="space-y-2">
          <Label for="hub-edit-target">{{ t('hub.manage.targetLabel') }}</Label>
          <Input id="hub-edit-target" v-model="editAddress" />
        </div>
        <div v-if="editTarget?.type === 'remote'" class="space-y-2">
          <Label for="hub-edit-token">{{ t('hub.manage.tokenLabel') }}</Label>
          <Input
            id="hub-edit-token"
            v-model="editToken"
            type="password"
            autocomplete="off"
            :disabled="editRemoveToken"
            :placeholder="editTarget?.hasToken ? t('hub.manage.tokenSavedPlaceholder') : ''"
          />
          <p class="text-xs text-muted-foreground">{{ t('hub.manage.tokenDescription') }}</p>
          <div v-if="editTarget?.hasToken" class="flex items-center gap-2">
            <Checkbox id="hub-edit-remove-token" v-model="editRemoveToken" />
            <Label for="hub-edit-remove-token" class="font-normal">{{ t('hub.manage.removeToken') }}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="editSaving" @click="editTarget = null">
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" :disabled="editSaving || !editName.trim() || !editAddress.trim()">
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <AlertDialog :open="!!removeTarget" @update:open="(v: boolean) => !v && (removeTarget = null)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('hub.manage.removeConfirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t('hub.manage.removeConfirmDescription') }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="removing">{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="removing" @click="confirmRemove">
          {{ t('hub.manage.remove') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

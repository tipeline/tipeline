<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import type { ColumnDef } from '@tanstack/vue-table';
import { Trash2 } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import Card from '@/components/Card.vue';
import DataTable from '@/components/DataTable.vue';
import { Button } from '@/components/ui/button';
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
import { toast } from '@/components/ui/sonner';
import { useQuery } from '@/composables/useQuery';
import { useTimezone } from '@/composables/useTimezone';
import { useErrorT } from '@/composables/useErrorT';
import { invokeCore } from '@/utils/invoke';
import { restoreFromTrash } from '@/utils/trash';
import { SEND } from '@/ipc-channels';
import { createColumns, type TrashItem } from '@/config/tables/TrashList';

const { t } = useI18n();
const router = useRouter();
const { appTimezone } = useTimezone();
const { translateError } = useErrorT();

const { data, isLoading, error, refetch } = useQuery<TrashItem[]>(SEND.TRASH_LIST);
const items = computed(() => data.value ?? []);

const busyId = ref<number | null>(null);
// One item to delete for good, or 'all' for Empty Trash.
const toDelete = ref<TrashItem | 'all' | null>(null);
const confirmOpen = computed({
  get: () => toDelete.value !== null,
  set: (open) => {
    if (!open) toDelete.value = null;
  },
});
const isDeleting = ref(false);

function formatDate(date: string) {
  try {
    return format(new TZDate(new Date(date), appTimezone.value), 'MMM d, yyyy HH:mm');
  } catch {
    return date;
  }
}

async function restore(item: TrashItem) {
  busyId.value = item.id;
  try {
    await restoreFromTrash(item.id);
    toast.success(t('trash.restored', { name: item.name }), {
      action: {
        label: t('trash.open'),
        onClick: () =>
          router.push(
            item.kind === 'app'
              ? { name: 'AppDetail', params: { aid: item.identifier } }
              : { name: 'TaskOverview', params: { tid: item.identifier } }
          ),
      },
    });
    await refetch();
  } catch (e: any) {
    toast.error(t('trash.restoreFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    busyId.value = null;
  }
}

async function confirmDelete() {
  const target = toDelete.value;
  if (!target) return;
  isDeleting.value = true;
  try {
    if (target === 'all') await invokeCore(SEND.TRASH_EMPTY);
    else await invokeCore(SEND.TRASH_DELETE, { ids: [target.id] });
    toDelete.value = null;
    await refetch();
  } catch (e: any) {
    toast.error(t('trash.deleteFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isDeleting.value = false;
  }
}

const columns = computed<ColumnDef<TrashItem>[]>(() =>
  createColumns(t, formatDate, () => busyId.value, restore, (item) => (toDelete.value = item))
);
</script>

<template>
  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ toDelete === 'all' ? t('trash.emptyAlert.title') : t('trash.deleteAlert.title') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{
            toDelete === 'all'
              ? t('trash.emptyAlert.description', items.length)
              : t('trash.deleteAlert.description', { name: toDelete?.name })
          }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="isDeleting"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click.prevent="confirmDelete"
        >
          {{ isDeleting ? t('common.deleting') : toDelete === 'all' ? t('trash.empty') : t('trash.deleteForever') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Page>
    <template #title>{{ t('trash.title') }}</template>
    <template #menu>
      <Button variant="outline" :disabled="!items.length" @click="toDelete = 'all'">
        <Trash2 class="w-4 h-4" />
        {{ t('trash.empty') }}
      </Button>
    </template>
    <template #content>
      <p class="text-sm text-muted-foreground mb-4">{{ t('trash.description') }}</p>
      <Card classContent="p-0" class="h-full">
        <template #content>
          <p v-if="error" class="p-6 text-sm text-destructive">{{ translateError(String(error)) }}</p>
          <DataTable
            v-else
            :columns="columns"
            :data="items"
            :flat="true"
            :empty-text="isLoading ? t('common.loading') : t('trash.emptyState')"
            :filters="[{ column: 'name', placeholder: t('trash.search') }]"
          />
        </template>
      </Card>
    </template>
  </Page>
</template>

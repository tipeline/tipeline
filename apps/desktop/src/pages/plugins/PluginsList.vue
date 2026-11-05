<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import Page from '@/components/Page.vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { useRouter } from 'vue-router';
import { useQuery } from '@/composables/useQuery';
import { createColumns, type PluginItem } from '@/config/tables/PluginsList';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { usePluginStore } from '@/store/pluginStore';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

const router = useRouter();
const { t } = useI18n();
const pluginStore = usePluginStore();
const { data: result, refetch } = useQuery<PluginItem[]>(SEND.PLUGIN_LIST);

type PendingToggle = { row: PluginItem; value: boolean; message: string };
const pendingToggle = ref<PendingToggle | null>(null);
const dialogOpen = ref(false);

async function onRequestToggle(row: PluginItem, value: boolean) {
  if (!value) {
    let message = 'Disabling this plugin may cause workflows that use its actions to fail when run.';
    try {
      const usage = await invokeCore<{ count: number; tasks: { name: string }[] }>(
        SEND.PLUGIN_USAGE,
        { group: row.group }
      );
      if (usage.count > 0) {
        const names = usage.tasks.map((t) => t.name).join(', ');
        message = `${usage.count} workflow(s) use actions from this plugin: ${names}. Disabling it will cause those workflows to fail when run.`;
      }
    } catch { /* use generic warning */ }
    pendingToggle.value = { row, value, message };
    dialogOpen.value = true;
  } else {
    await applyToggle(row, value);
  }
}

async function confirmToggle() {
  if (!pendingToggle.value) return;
  await applyToggle(pendingToggle.value.row, pendingToggle.value.value);
  pendingToggle.value = null;
}

async function applyToggle(row: PluginItem, value: boolean) {
  await invokeCore(SEND.PLUGIN_SET_ENABLED, { identifier: row.identifier, enabled: value });
  refetch();
  pluginStore.refreshAttentionCount();
}

async function onRemove(row: PluginItem) {
  await invokeCore(SEND.PLUGIN_REMOVE, { identifier: row.identifier });
  refetch();
  pluginStore.refreshAttentionCount();
}

const columns = computed<ColumnDef<PluginItem>[]>(() =>
  createColumns(t, router, onRequestToggle, onRemove)
);

onMounted(async () => {
  await invokeCore(SEND.PLUGIN_SCAN);
  refetch();
  pluginStore.refreshAttentionCount();
});
</script>

<template>
  <Page>
    <template #title>{{ t('plugins.title') }}</template>
    <template #content>
      <Card classContent="p-0" class="h-full">
        <template #content>
          <DataTable
            :columns="columns"
            :data="result ?? []"
            :flat="true"
            :filters="[{ column: 'name', placeholder: t('plugins.searchPlaceholder') }]"
            :empty-text="t('plugins.empty')"
          />
        </template>
      </Card>
    </template>
  </Page>

  <AlertDialog :open="dialogOpen" @update:open="dialogOpen = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('plugins.disableAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>{{ pendingToggle?.message }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="dialogOpen = false">{{ t('plugins.disableAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmToggle">{{ t('plugins.disableAlert.disable') }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

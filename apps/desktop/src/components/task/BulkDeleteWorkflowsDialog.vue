<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BulkDeleteDialog from '@/components/BulkDeleteDialog.vue';
import { deleteWorkflow } from '@/utils/deleteWorkflow';
import { deleteEach, type BulkDeleteItem } from '@/utils/bulkDelete';
import { useErrorT } from '@/composables/useErrorT';
import { fetchWorkflowUsage, isUsed, type WorkflowUsage } from '@/composables/useWorkflowUsage';

// Workflows that apps or other workflows still use, or that have schedules, are flagged before the user confirms; nothing is blocked.
const props = defineProps<{ items: { identifier: string; name: string }[] }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ deleted: [identifiers: string[]] }>();

const { t } = useI18n();
const { translateError } = useErrorT();

const usedBy = ref<Record<string, WorkflowUsage>>({});

watch(open, async (isOpen) => {
  usedBy.value = {};
  if (!isOpen) return;
  // A workflow that only calls another one being deleted along with it doesn't count.
  const deleting = new Set(props.items.map((item) => item.identifier));
  const entries = await Promise.all(
    props.items.map(async ({ identifier }) => {
      const usage = await fetchWorkflowUsage(identifier);
      return [identifier, { ...usage, workflows: usage.workflows.filter((w) => !deleting.has(w.identifier)) }] as const;
    })
  );
  usedBy.value = Object.fromEntries(entries.filter(([, usage]) => isUsed(usage)));
});

const warning = (usage: WorkflowUsage | undefined) => {
  if (!usage) return undefined;
  const parts: string[] = [];
  if (usage.apps.length) parts.push(t('tasks.bulkDelete.usedByApps', { apps: usage.apps.map((a) => a.name).join(', ') }));
  if (usage.workflows.length) {
    parts.push(t('tasks.bulkDelete.calledBy', { workflows: usage.workflows.map((w) => w.name).join(', ') }));
  }
  if (usage.schedules.length) parts.push(t('tasks.bulkDelete.schedules', usage.schedules.length));
  return parts.join(' · ');
};

const items = computed<BulkDeleteItem[]>(() =>
  props.items.map(({ identifier, name }) => ({ key: identifier, name, warning: warning(usedBy.value[identifier]) }))
);

const usedCount = computed(() => Object.keys(usedBy.value).length);

const remove = (list: BulkDeleteItem[]) => deleteEach(list, deleteWorkflow, translateError);
</script>

<template>
  <BulkDeleteDialog
    v-model:open="open"
    :items="items"
    i18n-key="tasks.bulkDelete"
    :notice="usedCount > 0 ? t('tasks.bulkDelete.usedBy', usedCount) : undefined"
    :remove="remove"
    @deleted="emit('deleted', $event)"
  />
</template>

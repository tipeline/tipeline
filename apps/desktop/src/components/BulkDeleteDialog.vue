<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { TriangleAlert } from 'lucide-vue-next';
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
import type { BulkDeleteItem, BulkDeleteResult } from '@/utils/bulkDelete';

// Confirms deleting the ticked rows of a list. Its text comes from `<i18nKey>.title`,
// `.description`, `.confirm`, `.deleted`, `.failed` and `.skipped` (all pluralized by
// count). Items with a `warning` are flagged; `notice` is a banner above the list.
const props = defineProps<{
  items: BulkDeleteItem[];
  i18nKey: string;
  notice?: string;
  remove: (items: BulkDeleteItem[]) => Promise<BulkDeleteResult>;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ deleted: [keys: string[]] }>();

const { t } = useI18n();
const isDeleting = ref(false);

async function confirmDelete() {
  isDeleting.value = true;
  let result: BulkDeleteResult;
  try {
    result = await props.remove(props.items);
  } catch (e: any) {
    toast.error(t(`${props.i18nKey}.failed`, props.items.length), { description: e?.message ?? String(e) });
    return;
  } finally {
    isDeleting.value = false;
  }
  const { deleted, failed, skipped = 0 } = result;
  open.value = false;
  if (deleted.length > 0) toast.success(t(`${props.i18nKey}.deleted`, deleted.length));
  if (skipped > 0) toast.info(t(`${props.i18nKey}.skipped`, skipped));
  if (failed.length > 0) {
    toast.error(t(`${props.i18nKey}.failed`, failed.length), {
      description: failed.map((f) => `${f.name}: ${f.error}`).join('\n'),
    });
  }
  emit('deleted', deleted);
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t(`${i18nKey}.title`, items.length) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t(`${i18nKey}.description`, items.length) }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div
        v-if="notice"
        class="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      >
        <TriangleAlert class="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <p>{{ notice }}</p>
      </div>
      <ul class="max-h-64 overflow-y-auto scroll-fade rounded-md border divide-y text-sm">
        <li v-for="item in items" :key="item.key" class="px-3 py-2 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <TriangleAlert
              v-if="item.warning"
              class="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <span class="truncate font-medium">{{ item.name }}</span>
          </div>
          <p v-if="item.warning" class="text-xs text-muted-foreground truncate">{{ item.warning }}</p>
        </li>
      </ul>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isDeleting">{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          :disabled="isDeleting"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click.prevent="confirmDelete"
        >
          {{ isDeleting ? t('common.deleting') : t(`${i18nKey}.confirm`, items.length) }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

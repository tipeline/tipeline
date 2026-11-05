<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2Icon } from 'lucide-vue-next';
import CapabilityList from '@/components/task/CapabilityList.vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import type { CapabilityReport } from '@/utils/capabilities';

/**
 * What the workflows in a backup or project export can do, shown in the restore
 * and import dialogs before anything is written. Nothing shows when they only
 * work with data.
 */
const props = defineProps<{ archivePath: string; projectOnly?: boolean }>();

const { t } = useI18n();
const report = ref<CapabilityReport | null>(null);
const loading = ref(false);
const error = ref('');

watch(
  () => props.archivePath,
  async (archivePath) => {
    report.value = null;
    error.value = '';
    if (!archivePath) return;
    loading.value = true;
    try {
      report.value = await invokeCore<CapabilityReport>(
        SEND.BACKUP_CAPABILITIES,
        {
          archivePath,
          projectOnly: props.projectOnly,
        }
      );
    } catch (e: any) {
      error.value = e?.message ?? String(e);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true }
);
</script>

<template>
  <div
    v-if="loading"
    class="flex items-center gap-2 text-xs text-muted-foreground"
  >
    <Loader2Icon class="size-3.5 animate-spin" />
    {{ t('capabilities.archiveChecking') }}
  </div>
  <p v-else-if="error" class="text-xs text-muted-foreground">
    {{ t('capabilities.archiveFailed', { error }) }}
  </p>
  <CapabilityList
    v-else-if="
      report && (report.capabilities.length || report.unknownWorkflows.length)
    "
    :report="report"
    :heading="t('capabilities.archiveCan')"
    class="max-h-72 overflow-y-auto scroll-fade"
  />
</template>

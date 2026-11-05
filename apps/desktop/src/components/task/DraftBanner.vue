<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarClockIcon, FilePenLineIcon, Loader2Icon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useScheduleText } from '@/composables/useScheduleText';
import CapabilityChips from '@/components/task/CapabilityChips.vue';
import type { CapabilityReport } from '@/utils/capabilities';

/**
 * Shown on a workflow the assistant drafted (metadata.draft). It runs from the
 * builder and Overview for testing, but not from the assistant, a schedule or
 * an app until someone marks it ready here.
 */
// The builder's and Overview's task objects are typed differently; both carry identifier and metadata.
const props = defineProps<{ task: Record<string, any> | null | undefined }>();
const emit = defineEmits<{ ready: [] }>();

const { t } = useI18n();
const { describe } = useScheduleText();
const marking = ref<'ready' | 'schedule' | null>(null);
const markedReady = ref(false);

function readMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw)) ?? {};
  } catch {
    return {};
  }
}

const isDraft = computed(() => !markedReady.value && readMetadata(props.task?.metadata).draft === true);
// A schedule the assistant proposed with the draft; it only starts if chosen here.
const proposed = computed(() => {
  const schedule = readMetadata(props.task?.metadata).draftSchedule;
  return schedule && (schedule.cron || schedule.runAt || schedule.everySeconds) ? schedule : null;
});

watch(
  () => props.task?.identifier,
  () => {
    markedReady.value = false;
  }
);

// What the draft can do, so the person checks those steps before marking it ready.
const capabilities = ref<CapabilityReport | null>(null);
watch(
  () => [isDraft.value, props.task?.identifier, props.task?.source],
  async () => {
    if (!isDraft.value || !props.task?.identifier) {
      capabilities.value = null;
      return;
    }
    try {
      capabilities.value = await invokeCore<CapabilityReport>(SEND.TASK_CAPABILITIES, {
        identifier: props.task.identifier,
      });
    } catch {
      capabilities.value = null;
    }
  },
  { immediate: true }
);
const reviewCapabilities = computed(() => capabilities.value?.capabilities.some((entry) => entry.review) ?? false);

async function markReady(withSchedule = false) {
  if (!props.task?.identifier) return;
  marking.value = withSchedule ? 'schedule' : 'ready';
  try {
    const result = await invokeCore<any>(SEND.TASK_MARK_READY, { identifier: props.task.identifier, withSchedule });
    markedReady.value = true;
    if (result?.scheduleError) {
      toast.warning(t('tasks.draft.scheduleFailed'), { description: result.scheduleError });
    } else {
      toast.success(withSchedule ? t('tasks.draft.markedReadyScheduled') : t('tasks.draft.markedReady'));
    }
    emit('ready');
  } catch (error: any) {
    toast.error(t('tasks.draft.markFailed'), { description: error?.message ?? String(error) });
  } finally {
    marking.value = null;
  }
}
</script>

<template>
  <div
    v-if="isDraft"
    class="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm"
    role="status"
  >
    <FilePenLineIcon class="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
    <div class="min-w-0 flex-1">
      <span class="font-medium">{{ t('tasks.draft.title') }}</span>
      <span class="text-muted-foreground"> {{ t('tasks.draft.explain') }}</span>
      <span v-if="proposed" class="mt-1 flex items-center gap-1.5 text-foreground" data-testid="draft-proposed-schedule">
        <CalendarClockIcon class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        {{ t('tasks.draft.proposedSchedule', { when: describe(proposed) }) }}
      </span>
      <span
        v-if="capabilities && capabilities.capabilities.length > 0"
        class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
        data-testid="draft-capabilities"
      >
        <span>{{ t('capabilities.draftCan') }}</span>
        <CapabilityChips :report="{ ...capabilities, unknownWorkflows: [] }" highlight />
        <span v-if="reviewCapabilities">{{ t('capabilities.draftCheck') }}</span>
      </span>
    </div>
    <Button size="sm" variant="outline" class="h-7" :disabled="marking !== null" @click="markReady(false)">
      <Loader2Icon v-if="marking === 'ready'" class="w-3.5 h-3.5 mr-1 animate-spin" />
      {{ t('tasks.draft.markReady') }}
    </Button>
    <Button v-if="proposed" size="sm" class="h-7" :disabled="marking !== null" @click="markReady(true)">
      <Loader2Icon v-if="marking === 'schedule'" class="w-3.5 h-3.5 mr-1 animate-spin" />
      {{ t('tasks.draft.markReadyAndSchedule') }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { CalendarClockIcon, FilePenLineIcon, Loader2Icon } from 'lucide-vue-next';
import { descriptionSummary } from '@tipeline/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import type { TaskItem } from '@/config/tables/TasksList';
import { useScheduleText } from '@/composables/useScheduleText';

/** Workflows the assistant drafted that nobody has marked ready yet. */
const emit = defineEmits<{ count: [value: number] }>();

const { t } = useI18n();
const router = useRouter();

const drafts = ref<TaskItem[]>([]);
const loading = ref(true);
const marking = ref<string | null>(null);
const { describe } = useScheduleText();

/** The schedule the assistant proposed with this draft, in words; null when none. */
function proposedSchedule(task: TaskItem): string | null {
  if (!task.draftSchedule) return null;
  try {
    const schedule = JSON.parse(task.draftSchedule);
    return schedule?.cron || schedule?.runAt || schedule?.everySeconds ? describe(schedule) : null;
  } catch {
    return null;
  }
}

async function load() {
  loading.value = true;
  try {
    const tasks = (await invokeCore<TaskItem[]>(SEND.TASK_LIST)) ?? [];
    drafts.value = tasks.filter((task) => task.draft === true || task.draft === 1);
  } finally {
    loading.value = false;
    emit('count', drafts.value.length);
  }
}

onMounted(load);

function drafted(task: TaskItem & { created_at?: string }) {
  return task.created_at ? formatDistanceToNow(new Date(task.created_at), { addSuffix: true }) : '';
}

async function markReady(task: TaskItem, withSchedule = false) {
  marking.value = task.identifier;
  try {
    const result = await invokeCore<any>(SEND.TASK_MARK_READY, { identifier: task.identifier, withSchedule });
    if (result?.scheduleError) {
      toast.warning(t('tasks.draft.scheduleFailed'), { description: result.scheduleError });
    } else {
      toast.success(withSchedule ? t('tasks.draft.markedReadyScheduled') : t('tasks.draft.markedReady'));
    }
    drafts.value = drafts.value.filter((d) => d.identifier !== task.identifier);
    emit('count', drafts.value.length);
  } catch (error: any) {
    toast.error(t('tasks.draft.markFailed'), { description: error?.message ?? String(error) });
  } finally {
    marking.value = null;
  }
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2Icon class="w-4 h-4 animate-spin" /> {{ t('agent.page.loading') }}
    </div>

    <div v-else-if="drafts.length === 0" class="flex flex-col items-center justify-center py-10 text-center">
      <FilePenLineIcon class="w-10 h-10 mb-3 text-muted-foreground/40" />
      <p class="text-sm font-medium">{{ t('agent.page.drafts.emptyTitle') }}</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-[46ch]">{{ t('agent.page.drafts.emptyDescription') }}</p>
    </div>

    <ul v-else class="divide-y">
      <li v-for="task in drafts" :key="task.identifier" class="flex flex-wrap items-center gap-3 px-4 py-3">
        <FilePenLineIcon class="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div class="min-w-0 flex-1">
          <button class="text-sm font-medium hover:underline text-left" @click="router.push(`/tasks/${task.identifier}`)">
            {{ task.name }}
          </button>
          <p class="text-xs text-muted-foreground truncate">
            <span v-if="task.description">{{ descriptionSummary(task.description) }}</span>
            <span v-if="task.description && drafted(task)"> · </span>
            <span v-if="drafted(task)">{{ t('agent.page.drafts.drafted', { when: drafted(task) }) }}</span>
          </p>
          <p v-if="proposedSchedule(task)" class="mt-0.5 flex items-center gap-1 text-xs">
            <CalendarClockIcon class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            {{ t('tasks.draft.proposedSchedule', { when: proposedSchedule(task) }) }}
          </p>
        </div>
        <Button size="sm" variant="outline" @click="router.push(`/tasks/${task.identifier}/edit`)">
          {{ t('agent.draft.openBuilder') }}
        </Button>
        <Button
          size="sm"
          :variant="proposedSchedule(task) ? 'outline' : 'default'"
          :disabled="marking !== null"
          @click="markReady(task)"
        >
          <Loader2Icon v-if="marking === task.identifier" class="w-3.5 h-3.5 mr-1 animate-spin" />
          {{ t('tasks.draft.markReady') }}
        </Button>
        <Button v-if="proposedSchedule(task)" size="sm" :disabled="marking !== null" @click="markReady(task, true)">
          {{ t('tasks.draft.markReadyAndSchedule') }}
        </Button>
      </li>
    </ul>
  </div>
</template>

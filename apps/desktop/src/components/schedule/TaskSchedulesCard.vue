<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CalendarClockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-vue-next';
import Card from '@/components/Card.vue';
import Dialog from '@/components/Dialog.vue';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
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
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useScheduleText } from '@/composables/useScheduleText';
import type { ScheduleItem } from '@/config/tables/SchedulesList';

/**
 * The workflow's own schedules on its Overview: what they are, when they run next,
 * a switch each, and a way to add one without going to the Schedules page.
 * A draft can't be scheduled until it's marked ready.
 */
const props = defineProps<{ taskIdentifier: string; taskName: string; draft: boolean }>();

const { t } = useI18n();
const router = useRouter();
const { describe, formatTime, status } = useScheduleText();

type ScheduleFormInstance = InstanceType<typeof ScheduleForm>;

const schedules = ref<ScheduleItem[]>([]);
const openNew = ref(false);
const editing = ref<ScheduleItem | null>(null);
const deleting = ref<ScheduleItem | null>(null);
// The dialog's action button closes it (clearing `deleting`) before our click handler runs,
// so the handler works from this copy taken when the dialog opened.
let pendingDelete: ScheduleItem | null = null;
watch(deleting, (v) => {
  if (v) pendingDelete = v;
});
const newFormRef = ref<ScheduleFormInstance | null>(null);
const editFormRef = ref<ScheduleFormInstance | null>(null);

async function reload() {
  try {
    const all = (await invokeCore<ScheduleItem[]>(SEND.SCHEDULE_LIST)) ?? [];
    schedules.value = all.filter((s) => s.taskIdentifier === props.taskIdentifier);
  } catch {
    schedules.value = [];
  }
}

watch(() => props.taskIdentifier, reload, { immediate: true });

const openEdit = computed({
  get: () => editing.value !== null,
  set: (open) => {
    if (!open) editing.value = null;
  },
});
const openDelete = computed({
  get: () => deleting.value !== null,
  set: (open) => {
    if (!open) deleting.value = null;
  },
});

function onSaved() {
  openNew.value = false;
  editing.value = null;
  reload();
}

function nextLine(schedule: ScheduleItem): string {
  if (schedule.nextRunAt) return `${t('schedules.nextRun')}: ${formatTime(schedule.nextRunAt)}`;
  if (status(schedule) === 'done' && schedule.lastRunAt) {
    return t('schedules.ranAt', { date: formatTime(schedule.lastRunAt) });
  }
  return t('schedules.paused');
}

async function toggle(schedule: ScheduleItem, enabled: boolean) {
  try {
    await invokeCore(SEND.SCHEDULE_TOGGLE, { scheduleIdentifier: schedule.scheduleIdentifier, enabled });
  } catch (error: any) {
    toast.error(t('schedules.toggleFailed'), { description: error?.message ?? String(error) });
  }
  reload();
}

async function confirmDelete() {
  const schedule = pendingDelete;
  pendingDelete = null;
  if (!schedule) return;
  try {
    await invokeCore(SEND.SCHEDULE_REMOVE, { scheduleIdentifier: schedule.scheduleIdentifier });
  } catch (error: any) {
    toast.error(t('schedules.deleteFailed'), { description: error?.message ?? String(error) });
  }
  deleting.value = null;
  reload();
}

defineExpose({ reload });
</script>

<template>
  <div class="shrink-0">
    <Card data-testid="task-schedules-card">
      <template #title>{{ t('schedules.card.title') }}</template>
      <template #actions>
        <Button size="sm" variant="outline" class="h-7" :disabled="draft" @click="openNew = true">
          <PlusIcon class="w-3.5 h-3.5" /> {{ t('schedules.card.add') }}
        </Button>
      </template>
      <template #content>
        <p v-if="draft" class="text-xs text-muted-foreground">{{ t('schedules.card.draftNote') }}</p>
        <div v-else-if="schedules.length === 0" class="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClockIcon class="w-4 h-4 shrink-0 opacity-50" />
          {{ t('schedules.card.empty') }}
        </div>
        <ul v-else class="divide-y -my-2 max-h-48 overflow-y-auto scroll-fade">
          <li
            v-for="schedule in schedules"
            :key="schedule.scheduleIdentifier"
            class="group flex items-center gap-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm truncate" :title="schedule.cron ?? undefined">{{ describe(schedule) }}</p>
              <p class="text-xs text-muted-foreground tabular-nums truncate">{{ nextLine(schedule) }}</p>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                class="p-1 rounded hover:bg-accent"
                :title="t('common.edit')"
                @click="editing = schedule"
              >
                <PencilIcon class="size-3.5" />
              </button>
              <button
                class="p-1 rounded hover:bg-accent"
                :title="t('common.delete')"
                @click="deleting = schedule"
              >
                <Trash2Icon class="size-3.5" />
              </button>
            </div>
            <span v-if="status(schedule) === 'done'" class="text-xs text-muted-foreground w-9 text-right">
              {{ t('schedules.done') }}
            </span>
            <Switch
              v-else
              class="scale-75"
              :model-value="schedule.enabled"
              :title="schedule.enabled ? t('common.disable') : t('common.enable')"
              @update:model-value="(value: boolean) => toggle(schedule, value)"
            />
          </li>
        </ul>
        <button
          v-if="!draft && schedules.length > 0"
          class="mt-3 text-xs text-muted-foreground underline underline-offset-2 decoration-border hover:text-foreground"
          @click="router.push('/schedules')"
        >
          {{ t('schedules.card.viewAll') }}
        </button>
      </template>
    </Card>

    <Dialog
      v-model="openNew"
      :title="t('schedules.card.newTitle')"
      :description="t('schedules.card.newDescription', { name: taskName })"
    >
      <ScheduleForm v-if="openNew" ref="newFormRef" mode="create" :fixed-task-identifier="taskIdentifier" @close="onSaved" />
      <template #footer>
        <Button :disabled="newFormRef?.saving" @click="newFormRef?.submit()">
          {{ newFormRef?.saving ? t('common.saving') : t('schedules.form.create') }}
        </Button>
      </template>
    </Dialog>

    <Dialog v-model="openEdit" :title="t('schedules.card.editTitle')" :description="taskName">
      <ScheduleForm
        v-if="editing"
        ref="editFormRef"
        mode="edit"
        :fixed-task-identifier="taskIdentifier"
        :initial-data="editing"
        @close="onSaved"
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
          <AlertDialogTitle>{{ t('schedules.card.deleteTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t('schedules.card.deleteDescription', { name: taskName }) }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            {{ t('common.delete') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

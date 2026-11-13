<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PencilIcon } from 'lucide-vue-next';
import Dialog from '@/components/Dialog.vue';
import ScheduleForm from '@/components/schedule/ScheduleForm.vue';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useScheduleText } from '@/composables/useScheduleText';
import type { ScheduleItem } from '@/config/tables/SchedulesList';

/**
 * One schedule's details (when, next and last run, on or off) with a way to edit it,
 * for places that show a single schedule, such as the project map's side panel.
 */
const props = defineProps<{ scheduleIdentifier: string }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const { t } = useI18n();
const { describe, formatTime, status } = useScheduleText();

type ScheduleFormInstance = InstanceType<typeof ScheduleForm>;

const schedule = ref<ScheduleItem | null>(null);
const loaded = ref(false);
const editing = ref(false);
const formRef = ref<ScheduleFormInstance | null>(null);

async function reload() {
  try {
    const all = (await invokeCore<ScheduleItem[]>(SEND.SCHEDULE_LIST)) ?? [];
    schedule.value = all.find((s) => s.scheduleIdentifier === props.scheduleIdentifier) ?? null;
  } catch {
    schedule.value = null;
  } finally {
    loaded.value = true;
  }
}

watch(() => props.scheduleIdentifier, reload, { immediate: true });

const state = computed(() => (schedule.value ? status(schedule.value) : null));

async function toggle(enabled: boolean) {
  if (!schedule.value) return;
  try {
    await invokeCore(SEND.SCHEDULE_TOGGLE, { scheduleIdentifier: schedule.value.scheduleIdentifier, enabled });
  } catch (error: any) {
    toast.error(t('schedules.toggleFailed'), { description: error?.message ?? String(error) });
  }
  await reload();
  emit('changed');
}

async function onSaved() {
  editing.value = false;
  await reload();
  emit('changed');
}
</script>

<template>
  <div v-if="schedule" class="flex flex-col gap-2 rounded-lg border p-3" data-testid="schedule-details">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-semibold">{{ t('schedules.when') }}</span>
      <span v-if="state === 'done'" class="text-xs text-muted-foreground">{{ t('schedules.done') }}</span>
      <Switch
        v-else
        class="scale-75"
        :model-value="schedule.enabled"
        :title="schedule.enabled ? t('common.disable') : t('common.enable')"
        @update:model-value="(value: boolean) => toggle(value)"
      />
    </div>
    <p class="text-sm">{{ describe(schedule) }}</p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      <template v-if="schedule.cron">
        <dt class="text-muted-foreground">{{ t('schedules.details.cron') }}</dt>
        <dd class="font-mono">{{ schedule.cron }}</dd>
      </template>
      <dt class="text-muted-foreground">{{ t('schedules.form.task') }}</dt>
      <dd class="truncate">{{ schedule.taskName }}</dd>
      <dt class="text-muted-foreground">{{ t('schedules.nextRun') }}</dt>
      <dd class="tabular-nums">{{ schedule.nextRunAt ? formatTime(schedule.nextRunAt) : state === 'done' ? '—' : t('schedules.paused') }}</dd>
      <dt class="text-muted-foreground">{{ t('schedules.details.lastRun') }}</dt>
      <dd class="tabular-nums">{{ schedule.lastRunAt ? formatTime(schedule.lastRunAt) : t('schedules.details.never') }}</dd>
      <template v-if="Object.keys(schedule.variables ?? {}).length">
        <dt class="text-muted-foreground">{{ t('schedules.details.parameters') }}</dt>
        <dd class="truncate" :title="JSON.stringify(schedule.variables)">{{ Object.keys(schedule.variables).join(', ') }}</dd>
      </template>
    </dl>
    <div>
      <Button size="sm" variant="outline" @click="editing = true">
        <PencilIcon class="size-3.5" /> {{ t('common.edit') }}
      </Button>
    </div>

    <Dialog v-model="editing" :title="t('schedules.card.editTitle')" :description="schedule.taskName">
      <ScheduleForm
        v-if="editing"
        ref="formRef"
        mode="edit"
        :fixed-task-identifier="schedule.taskIdentifier"
        :initial-data="schedule"
        @close="onSaved"
      />
      <template #footer>
        <Button :disabled="formRef?.saving" @click="formRef?.submit()">
          {{ formRef?.saving ? t('common.saving') : t('schedules.form.update') }}
        </Button>
      </template>
    </Dialog>
  </div>
  <p v-else-if="loaded" class="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
    {{ t('schedules.details.missing') }}
  </p>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { format } from 'date-fns';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useQuery } from '@/composables/useQuery';
import { useScheduleText } from '@/composables/useScheduleText';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import {
  MIN_SCHEDULE_INTERVAL_SECONDS,
  isCronExpression,
  nextCronRuns,
  nextIntervalRuns,
  parseSchedule,
  type ParsedSchedule,
} from '@tipeline/utils';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import VariableForm from '@/components/forms/VariableForm.vue';
import type { TaskItem } from '@/config/tables/TasksList';

type VariableFormInstance = InstanceType<typeof VariableForm>;

const props = defineProps<{
  mode: 'create' | 'edit';
  /** The workflow to schedule, chosen already (the Overview): the picker is hidden. */
  fixedTaskIdentifier?: string;
  initialData?: {
    scheduleIdentifier: string;
    taskIdentifier: string;
    cron: string | null;
    runAt?: string | null;
    everySeconds?: number | null;
    variables?: Record<string, any>;
  };
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const { describe, formatTime } = useScheduleText();
const { data: tasks } = useQuery<TaskItem[]>(SEND.TASK_LIST);

const selectedTask = ref(props.fixedTaskIdentifier ?? props.initialData?.taskIdentifier ?? '');
const variableFormRef = ref<VariableFormInstance | null>(null);
const submitButtonRef = ref<HTMLButtonElement | null>(null);

const collectedVariables = ref<Record<string, any>>(props.initialData?.variables ?? {});
const pendingSchedule = ref<{ taskIdentifier: string; parsed: ParsedSchedule } | null>(null);
const saving = ref(false);

const { data: taskDetail, refetch: fetchTaskDetail } = useQuery<any>(
  SEND.TASK_DETAIL,
  selectedTask.value ? { identifier: selectedTask.value } : null
);

watch(selectedTask, (val) => {
  collectedVariables.value = {};
  if (val) fetchTaskDetail({ identifier: val });
});

const formFields = computed(() => {
  if (!taskDetail.value?.source) return [];
  try {
    const parsed = JSON.parse(taskDetail.value.source);
    const fields = parsed?.pipeline?.variables ?? [];
    const saved = collectedVariables.value;
    return fields.map((f: any) =>
      Object.prototype.hasOwnProperty.call(saved, f.name) ? { ...f, value: saved[f.name] } : f
    );
  } catch {
    return [];
  }
});

const hasVariables = computed(() => formFields.value.length > 0);

// What's in the box when editing: the cron, or the one-time date as words chrono reads back.
function initialWhen(): string {
  const data = props.initialData;
  if (data?.cron) return data.cron;
  if (data?.everySeconds) return `every ${data.everySeconds} seconds`;
  if (data?.runAt) return format(new Date(data.runAt), 'yyyy-MM-dd HH:mm');
  return '';
}

function errorText(parsed: Extract<ParsedSchedule, { ok: false }>): string {
  return t(`schedules.form.errors.${parsed.error}`, { seconds: MIN_SCHEDULE_INTERVAL_SECONDS });
}

const formSchema = toTypedSchema(
  z.object({
    taskIdentifier: z.string().min(1, 'Workflow is required'),
    when: z.string().superRefine((value, ctx) => {
      const parsed = parseSchedule(value);
      if (!parsed.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: errorText(parsed) });
    }),
  })
);

const { handleSubmit, setFieldValue, values } = useForm({
  validationSchema: formSchema,
  initialValues: {
    taskIdentifier: selectedTask.value,
    when: initialWhen(),
  },
});

watch(selectedTask, (val) => setFieldValue('taskIdentifier', val));

const PRESETS = ['hourly', 'daily', 'weekdays', 'weekly', 'monthly', 'seconds', 'tomorrow'] as const;

function applyPreset(key: (typeof PRESETS)[number]) {
  setFieldValue('when', t(`schedules.form.presets.${key}`));
}

// Live reading of the box: what it means and when it runs next.
const parsed = computed(() => (values.when?.trim() ? parseSchedule(values.when) : null));
const preview = computed(() => {
  const p = parsed.value;
  if (!p?.ok) return null;
  if (p.kind === 'once') return { summary: t('schedules.form.runsOnce', { date: formatTime(p.runAt) }) };
  if (p.kind === 'interval') {
    // Counted from when it's saved and turned on.
    return {
      summary: describe({ everySeconds: p.seconds }),
      cron: null,
      next: nextIntervalRuns(p.seconds, 3).map((d) => formatTime(d)).join(' · '),
      perDay: p.seconds < 300 ? Math.round(86400 / p.seconds).toLocaleString() : null,
    };
  }
  const runs = nextCronRuns(p.cron, 3);
  const gapSeconds = runs.length > 1 ? (runs[1].getTime() - runs[0].getTime()) / 1000 : Infinity;
  return {
    summary: describe({ cron: p.cron }),
    // Only worth showing when the words were turned into a cron.
    cron: isCronExpression(values.when ?? '') ? null : p.cron,
    next: runs.map((d) => formatTime(d)).join(' · '),
    // Frequent schedules fill run history fast; say roughly how fast.
    perDay: gapSeconds < 300 ? Math.round(86400 / gapSeconds).toLocaleString() : null,
  };
});

async function saveSchedule() {
  const pending = pendingSchedule.value;
  if (!pending || !pending.parsed.ok) return;
  pendingSchedule.value = null;
  const timing =
    pending.parsed.kind === 'cron'
      ? { cron: pending.parsed.cron }
      : pending.parsed.kind === 'interval'
        ? { everySeconds: pending.parsed.seconds }
        : { runAt: pending.parsed.runAt.toISOString() };

  saving.value = true;
  try {
    await invokeCore(SEND.SCHEDULE_SET, {
      identifier: pending.taskIdentifier,
      ...timing,
      variables: JSON.parse(JSON.stringify(collectedVariables.value)),
    });
    // Replace the old one only once the new one is saved, so a refused edit loses nothing.
    if (props.mode === 'edit' && props.initialData) {
      await invokeCore(SEND.SCHEDULE_REMOVE, {
        scheduleIdentifier: props.initialData.scheduleIdentifier,
      });
    }
    emit('close');
  } catch (e: any) {
    toast.error(t('schedules.form.saveFailed'), { description: e?.message });
  } finally {
    saving.value = false;
  }
}

const onVariablesSubmit = async (data: Record<string, any>) => {
  collectedVariables.value = JSON.parse(JSON.stringify(data));
  await saveSchedule();
};

const onSubmit = handleSubmit(async (formValues) => {
  pendingSchedule.value = {
    taskIdentifier: formValues.taskIdentifier,
    parsed: parseSchedule(formValues.when),
  };
  if (hasVariables.value) {
    variableFormRef.value?.submit();
    return;
  }
  await saveSchedule();
});

function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit, saving });
</script>

<template>
  <div class="w-full">
    <form @submit="onSubmit" class="flex flex-col gap-5">
      <FormField v-if="!fixedTaskIdentifier" name="taskIdentifier">
        <FormItem>
          <FormLabel>{{ t('schedules.form.task') }}</FormLabel>
          <Select v-model="selectedTask">
            <FormControl>
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('schedules.form.taskPlaceholder')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem
                v-for="task in tasks ?? []"
                :key="task.identifier"
                :value="task.identifier"
              >
                {{ task.name }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="when">
        <FormItem>
          <FormLabel>{{ t('schedules.form.when') }}</FormLabel>
          <FormControl>
            <Input
              type="text"
              :placeholder="t('schedules.form.whenPlaceholder')"
              class="w-full"
              autocomplete="off"
              v-bind="componentField"
            />
          </FormControl>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="key in PRESETS"
              :key="key"
              type="button"
              class="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              @click="applyPreset(key)"
            >
              {{ t(`schedules.form.presets.${key}`) }}
            </button>
          </div>
          <div
            v-if="preview"
            class="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5"
            data-testid="schedule-preview"
          >
            <p class="text-sm font-medium text-foreground">{{ preview.summary }}</p>
            <p v-if="preview.cron" class="text-muted-foreground font-mono">
              {{ t('schedules.form.cronIs', { cron: preview.cron }) }}
            </p>
            <p v-if="preview.next" class="text-muted-foreground tabular-nums">
              {{ t('schedules.form.nextRuns', { runs: preview.next }) }}
            </p>
            <p v-if="preview.perDay" class="text-amber-700 dark:text-amber-400">
              {{ t('schedules.form.perDay', { count: preview.perDay }) }}
            </p>
          </div>
          <FormDescription>{{ t('schedules.form.whenHelp') }}</FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>

      <div v-if="hasVariables" class="rounded-lg border bg-muted/40 overflow-hidden">
        <div class="px-4 py-3 border-b bg-muted/60">
          <p class="text-sm font-medium">{{ t('schedules.form.parameters') }}</p>
          <p class="text-xs text-muted-foreground mt-0.5">{{ t('schedules.form.parametersDescription') }}</p>
        </div>
        <div class="p-4 max-h-65 overflow-y-auto">
          <VariableForm :fields="formFields" ref="variableFormRef" @submit="onVariablesSubmit" />
        </div>
      </div>

      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>

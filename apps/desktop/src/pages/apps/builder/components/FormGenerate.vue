<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppFormField } from '@tipeline/schemas';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import {
  fieldsFromVariables,
  type WorkflowVariable,
} from '@/utils/formFromWorkflow';

// "Generate from workflow": pick a workflow, review the fields its settable variables
// produce, and the parent replaces the form's fields and wires Submit to run it.
const props = defineProps<{
  workflows: Array<{ identifier: string; name: string }>;
}>();
const emit = defineEmits<{
  submit: [
    data: {
      taskIdentifier: string;
      workflowName: string;
      fields: AppFormField[];
    },
  ];
}>();
const { t } = useI18n();

const taskIdentifier = ref('');
const variables = ref<WorkflowVariable[]>([]);
const excluded = ref<Set<string>>(new Set());
const loading = ref(false);

watch(taskIdentifier, async (id) => {
  variables.value = [];
  excluded.value = new Set();
  if (!id) return;
  loading.value = true;
  try {
    const task = await invokeCore(SEND.TASK_DETAIL, { identifier: id });
    const declared = task?.source
      ? JSON.parse(task.source)?.pipeline?.variables
      : [];
    variables.value = Array.isArray(declared) ? declared : [];
  } finally {
    loading.value = false;
  }
});

const candidates = computed(() => fieldsFromVariables(variables.value));
const skipped = computed(
  () => variables.value.length - candidates.value.length
);
const chosen = computed(() =>
  candidates.value.filter((f) => !excluded.value.has(f.name))
);

function toggle(name: string, on: boolean) {
  const next = new Set(excluded.value);
  if (on) next.delete(name);
  else next.add(name);
  excluded.value = next;
}

const canSubmit = computed(
  () => !!taskIdentifier.value && chosen.value.length > 0
);

function submit() {
  if (!canSubmit.value) return;
  emit('submit', {
    taskIdentifier: taskIdentifier.value,
    workflowName:
      props.workflows.find((w) => w.identifier === taskIdentifier.value)
        ?.name ?? '',
    fields: chosen.value,
  });
}

defineExpose({ submit, canSubmit });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label>{{ t('builder.runnable.workflow') }}</Label>
      <Select v-model="taskIdentifier">
        <SelectTrigger
          ><SelectValue :placeholder="t('builder.runnable.selectWorkflow')"
        /></SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="w in workflows"
            :key="w.identifier"
            :value="w.identifier"
            >{{ w.name }}</SelectItem
          >
        </SelectContent>
      </Select>
    </div>

    <template v-if="taskIdentifier && !loading">
      <div v-if="candidates.length" class="flex flex-col gap-1.5">
        <Label>{{ t('builder.form.generateFields') }}</Label>
        <label
          v-for="field in candidates"
          :key="field.name"
          class="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-2 py-1.5"
        >
          <Checkbox
            :model-value="!excluded.has(field.name)"
            @update:model-value="(on) => toggle(field.name, on === true)"
          />
          <span class="flex-1 min-w-0 truncate">{{ field.label }}</span>
          <span class="text-xs text-muted-foreground font-mono"
            >{{ field.name }} ·
            {{ t(`builder.form.types.${field.type}`) }}</span
          >
        </label>
      </div>
      <p v-else class="text-sm text-muted-foreground m-0">
        {{ t('builder.runnable.noPublicVariables') }}
      </p>
      <p v-if="skipped" class="text-xs text-muted-foreground m-0">
        {{ t('builder.form.skippedVariables', { count: skipped }) }}
      </p>
      <p class="text-xs text-muted-foreground m-0">
        {{ t('builder.form.generateHint') }}
      </p>
    </template>
  </div>
</template>

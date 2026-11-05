<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AlertTriangleIcon, CalendarClockIcon, Loader2Icon, PlayIcon, WorkflowIcon } from 'lucide-vue-next';
import { NON_EDITABLE_FIELD_TYPES, isExternallySourced } from '@tipeline/schemas';
import { MIN_SCHEDULE_INTERVAL_SECONDS, descriptionSummary, parseSchedule } from '@tipeline/utils';
import { Input } from '@/components/ui/input';
import { useScheduleText } from '@/composables/useScheduleText';
import VariableForm from '@/components/forms/VariableForm.vue';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useAgentStore, type AgentTurn } from '@/store/agentStore';
import { usePluginStore } from '@/store/pluginStore';
import { flowFieldErrorActions, hasFlowOrderingErrors } from '@/utils/flowValidation';

/**
 * The run the agent suggests, as the workflow's own run form with the values it
 * read from the request filled in. Nothing runs until the user clicks Run.
 * When the request said how often ("every 40 seconds"), the card offers to create
 * that schedule instead, with the same values; running it once stays possible.
 */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();
const pluginStore = usePluginStore();

// The Assistant may set protected inputs, so the person sees them here before a run.
const HIDDEN_FIELD_VISIBILITIES = ['private'];

const loading = ref(true);
const loadFailed = ref(false);
const variables = ref<any[]>([]);
const actions = ref<any[]>([]);
const description = ref('');
const formRef = ref<InstanceType<typeof VariableForm> | null>(null);

const proposal = computed(() => props.turn.proposal!);

const schedule = ref(props.turn.schedule ?? '');
watch(
  () => props.turn.schedule,
  (next) => {
    schedule.value = next ?? '';
  }
);
const offersSchedule = computed(() => !!props.turn.schedule);
const { describe } = useScheduleText();
const scheduleReading = computed(() => {
  if (!schedule.value.trim()) return { error: true, text: t('schedules.form.errors.empty') };
  const parsed = parseSchedule(schedule.value);
  if (!parsed.ok) {
    return { error: true, text: t(`schedules.form.errors.${parsed.error}`, { seconds: MIN_SCHEDULE_INTERVAL_SECONDS }) };
  }
  return {
    error: false,
    text: describe(
      parsed.kind === 'cron'
        ? { cron: parsed.cron }
        : parsed.kind === 'interval'
          ? { everySeconds: parsed.seconds }
          : { runAt: parsed.runAt.toISOString() }
    ),
  };
});
// What the form's submit does: run now, or create the schedule.
const submitAs = ref<'run' | 'schedule'>('run');
const scheduling = ref(false);

async function load(identifier: string) {
  loading.value = true;
  loadFailed.value = false;
  try {
    const task = await invokeCore<any>(SEND.TASK_DETAIL, { identifier });
    const source = task?.source ? JSON.parse(task.source) : null;
    if (!source) throw new Error('not found');
    variables.value = Array.isArray(source.pipeline?.variables) ? source.pipeline.variables : [];
    actions.value = Array.isArray(source.pipeline?.actions) ? source.pipeline.actions : [];
    description.value = descriptionSummary(source.description ?? '');
  } catch {
    loadFailed.value = true;
    variables.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => proposal.value.identifier, load, { immediate: true });

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** The workflow's variables with the agent's values in place of their defaults. */
const fields = computed(() =>
  variables.value.map((field) =>
    Object.prototype.hasOwnProperty.call(proposal.value.variables, field.name)
      ? { ...field, value: proposal.value.variables[field.name] }
      : field
  )
);

const visibleFields = computed(() =>
  fields.value.filter(
    (f) =>
      !(NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(f.type) &&
      !HIDDEN_FIELD_VISIBILITIES.includes(f.visibility ?? 'private') &&
      !f.output &&
      !isExternallySourced(f)
  )
);

const highlight = computed(() => {
  const marks: Record<string, 'filled' | 'missing'> = {};
  for (const field of visibleFields.value) {
    if (Object.prototype.hasOwnProperty.call(proposal.value.variables, field.name)) marks[field.name] = 'filled';
    else if (field.required && isEmpty(field.value)) marks[field.name] = 'missing';
  }
  return marks;
});

/**
 * Steps the builder would flag: settings missing or invalid, or out of order.
 * The workflow's Overview won't run it in that state, and neither does this card,
 * since the run would only fail before it starts.
 */
const brokenSteps = computed(() =>
  flowFieldErrorActions(actions.value, pluginStore.pluginParams, pluginStore.pluginRules).map(
    (action) => action.label || `${action.group}.${action.name}`
  )
);
const orderingProblem = computed(() => hasFlowOrderingErrors(actions.value));
const notReady = computed(() => brokenSteps.value.length > 0 || orderingProblem.value);

function openBuilder() {
  router.push(`/tasks/${proposal.value.identifier}/edit`);
}

const formKey = computed(() => `${proposal.value.identifier}:${variables.value.length}`);

function run() {
  submitAs.value = 'run';
  if (visibleFields.value.length === 0) agentStore.runProposal(props.turn.id, {});
  else formRef.value?.submit();
}

async function createSchedule() {
  submitAs.value = 'schedule';
  if (visibleFields.value.length === 0) await scheduleWith({});
  else formRef.value?.submit();
}

async function scheduleWith(values: Record<string, unknown>) {
  scheduling.value = true;
  try {
    await agentStore.scheduleProposal(props.turn.id, values, schedule.value);
  } finally {
    scheduling.value = false;
  }
}

function onSubmit(data: Record<string, unknown>) {
  // The form accepts an empty string for a required text field; a run with it would not do what was asked.
  const missing = visibleFields.value.filter((f) => f.required && isEmpty(data[f.name]));
  if (missing.length > 0) {
    toast.error(t('agent.proposal.fillMissing', { fields: missing.map((f) => f.label || f.name).join(', ') }));
    return;
  }
  const values = JSON.parse(JSON.stringify(data));
  if (submitAs.value === 'schedule') void scheduleWith(values);
  else agentStore.runProposal(props.turn.id, values);
}

function openWorkflow() {
  router.push(`/tasks/${proposal.value.identifier}`);
}
</script>

<template>
  <div class="rounded-md border text-sm">
    <div class="flex items-start gap-2 px-3 py-2 border-b">
      <WorkflowIcon class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <button class="font-medium hover:underline text-left" @click="openWorkflow">{{ proposal.name }}</button>
        <p v-if="description" class="text-xs text-muted-foreground line-clamp-2">{{ description }}</p>
      </div>
    </div>

    <p v-if="proposal.remembered" class="px-3 pt-2 text-[11px] text-muted-foreground">
      {{ t('agent.choice.lastTime') }}
    </p>
    <div
      v-if="!loading && notReady"
      class="mx-3 mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs"
    >
      <AlertTriangleIcon class="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div class="min-w-0 flex-1 space-y-1">
        <p v-if="brokenSteps.length > 0">
          {{ t('agent.proposal.brokenSteps', { steps: brokenSteps.join(', ') }) }}
        </p>
        <p v-else>{{ t('agent.proposal.orderingProblem') }}</p>
        <button class="text-primary hover:underline" @click="openBuilder">{{ t('agent.proposal.openBuilder') }}</button>
      </div>
    </div>

    <div class="px-3 py-3">
      <div v-if="loading" class="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2Icon class="w-3.5 h-3.5 animate-spin" /> {{ t('agent.proposal.loading') }}
      </div>
      <p v-else-if="loadFailed" class="text-xs text-red-600 dark:text-red-400">{{ t('agent.proposal.loadFailed') }}</p>
      <p v-else-if="visibleFields.length === 0" class="text-xs text-muted-foreground">{{ t('agent.proposal.noInputs') }}</p>
      <VariableForm
        v-else
        :key="formKey"
        ref="formRef"
        :fields="fields"
        :highlight="highlight"
        :hidden-visibilities="HIDDEN_FIELD_VISIBILITIES"
        @submit="onSubmit"
      />
    </div>

    <div v-if="offersSchedule" class="px-3 pb-3 space-y-1" data-testid="proposal-schedule">
      <label class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" :for="`schedule-${turn.id}`">
        <CalendarClockIcon class="w-3.5 h-3.5" /> {{ t('agent.draft.scheduleLabel') }}
      </label>
      <Input :id="`schedule-${turn.id}`" v-model="schedule" class="h-8 text-sm" autocomplete="off" />
      <p class="text-[11px]" :class="scheduleReading.error ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'">
        {{ scheduleReading.text }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-t">
      <Button
        v-if="offersSchedule"
        size="sm"
        :disabled="loading || loadFailed || notReady || scheduleReading.error || scheduling"
        @click="createSchedule"
      >
        <Loader2Icon v-if="scheduling" class="w-3.5 h-3.5 mr-1 animate-spin" />
        <CalendarClockIcon v-else class="w-3.5 h-3.5 mr-1" /> {{ t('agent.schedule.create') }}
      </Button>
      <Button
        size="sm"
        :variant="offersSchedule ? 'outline' : 'default'"
        :disabled="loading || loadFailed || notReady"
        @click="run"
      >
        <PlayIcon class="w-3.5 h-3.5 mr-1" /> {{ offersSchedule ? t('agent.schedule.runOnce') : t('agent.proposal.run') }}
      </Button>
      <Button size="sm" variant="ghost" @click="agentStore.dismissProposal(turn.id)">
        {{ t('agent.proposal.dismiss') }}
      </Button>
    </div>

    <div v-if="proposal.alternatives.length > 0" class="px-3 pb-2 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-1">
      <span>{{ t('agent.proposal.alternatives') }}</span>
      <button
        v-for="alt in proposal.alternatives"
        :key="alt.identifier"
        class="text-primary hover:underline"
        @click="agentStore.switchProposal(turn.id, alt.identifier)"
      >
        {{ alt.name }}<span v-if="alt.hub" class="text-muted-foreground"> ({{ alt.hub.name }})</span>
      </button>
    </div>
  </div>
</template>

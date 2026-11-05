<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppAction, AppRunnable } from '@tipeline/schemas';
import type { RunnableDraft } from '@/store/builderStore';
import { Pencil, Plus, Trash2 } from 'lucide-vue-next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ActionListEditor from './ActionListEditor.vue';
import BindingInput from './BindingInput.vue';
import { BINDING_SUGGESTIONS } from '../bindingSuggestions';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// Creates or edits one runnable: a named call from a page to a workflow, either
// running it (inputs in, outputs back) or reading results of its past runs.
// Only variables the workflow exposes can be wired: inputs must be non-private
// (public/protected), outputs non-private and non-secret — core enforces the same.

const props = defineProps<{
  /** null when creating */
  name: string | null;
  runnable: AppRunnable | null;
  /** identifier of the workflow the runnable currently points at */
  taskIdentifier: string | null;
  workflows: Array<{ identifier: string; name: string }>;
  takenNames: string[];
  pages: Array<{ id: string; name: string }>;
  runnables: string[];
  components?: Array<{ id: string; type: string }>;
}>();

const emit = defineEmits<{
  submit: [
    data: {
      name: string;
      taskIdentifier: string;
      workflowName: string;
      runnable: RunnableDraft;
    },
  ];
  /** Open the selected workflow's builder. */
  editWorkflow: [identifier: string];
  /** Create a workflow; the host passes it back through selectWorkflow. */
  createWorkflow: [];
}>();

const { t } = useI18n();
const injected = inject(BINDING_SUGGESTIONS, null);
const suggestions = computed(() => injected?.page.value ?? []);

interface WorkflowVariable {
  name: string;
  type?: string;
  label?: string;
  visibility?: string;
  output?: boolean;
  secret?: boolean;
}

const name = ref('');
const mode = ref<'run' | 'history'>('run');
const taskIdentifier = ref('');
const trigger = ref<'load' | 'manual'>('manual');
const inputs = ref<Array<{ key: string; value: string }>>([]);
const outputs = ref<string[]>([]);
const persist = ref(true);
const confirm = ref('');
const source = ref<'actionResults' | 'variables'>('actionResults');
const filterMode = ref<'latest' | 'range' | 'byId' | 'dateRange'>('latest');
// History filter values: literals or bindings (e.g. a date range component's dates).
const count = ref('5');
const pipelineIdentifier = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const actionIdentifier = ref('');
const variableName = ref('');
const onSuccess = ref<AppAction[]>([]);
const onError = ref<AppAction[]>([]);
const onPaused = ref<AppAction[]>([]);

watch(
  () => [props.runnable, props.name, props.taskIdentifier] as const,
  ([r, n, task]) => {
    name.value = n ?? '';
    mode.value = r?.mode ?? 'run';
    taskIdentifier.value = task ?? '';
    trigger.value = r?.trigger ?? 'manual';
    onSuccess.value = JSON.parse(JSON.stringify(r?.onSuccess ?? []));
    onError.value = JSON.parse(JSON.stringify(r?.onError ?? []));
    onPaused.value = JSON.parse(
      JSON.stringify(r?.mode === 'run' ? (r.onPaused ?? []) : [])
    );
    if (r?.mode === 'run') {
      inputs.value = Object.entries(r.inputs ?? {}).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
      outputs.value = [...(r.outputs ?? [])];
      persist.value = r.persist ?? true;
      confirm.value = r.confirm ?? '';
    } else {
      inputs.value = [];
      outputs.value = [];
      persist.value = true;
      confirm.value = '';
    }
    if (r?.mode === 'history') {
      source.value = r.source;
      filterMode.value = r.filter.mode;
      count.value = String(r.filter.count ?? 5);
      pipelineIdentifier.value = r.filter.pipelineIdentifier ?? '';
      dateFrom.value = r.filter.dateFrom ?? '';
      dateTo.value = r.filter.dateTo ?? '';
      actionIdentifier.value = r.actionIdentifier ?? '';
      variableName.value = r.variableName ?? '';
    }
  },
  { immediate: true }
);

// Variables of the selected workflow (for the input/output pickers).
const variables = ref<WorkflowVariable[]>([]);
// Only a loaded workflow can say a saved variable is gone; until then nothing is flagged.
const variablesLoaded = ref(false);
watch(
  taskIdentifier,
  async (id) => {
    variables.value = [];
    variablesLoaded.value = false;
    if (!id) return;
    try {
      const task = await invokeCore(SEND.TASK_DETAIL, { identifier: id });
      const declared = task?.source
        ? JSON.parse(task.source)?.pipeline?.variables
        : [];
      variables.value = Array.isArray(declared) ? declared : [];
      variablesLoaded.value = taskIdentifier.value === id;
    } catch {
      variables.value = [];
    }
  },
  { immediate: true }
);

const isPrivate = (v: WorkflowVariable) =>
  (v.visibility ?? 'private') === 'private';
const inputCandidates = computed(() =>
  variables.value.filter((v) => !isPrivate(v) && !v.output)
);
const outputCandidates = computed(() =>
  variables.value.filter((v) => !isPrivate(v) && !v.secret)
);
const hiddenCount = computed(() => variables.value.filter(isPrivate).length);

// Saved names the workflow no longer allows (deleted, made private or secret, e.g.
// after "Edit workflow"). They have no picker entry, so they're listed apart to be removed.
function staleReason(
  varName: string,
  use: 'input' | 'output' | 'read'
): 'missing' | 'private' | 'secret' | null {
  if (!variablesLoaded.value || !varName) return null;
  const v = variables.value.find((x) => x.name === varName);
  if (!v) return 'missing';
  if (use !== 'read' && isPrivate(v)) return 'private';
  if (use !== 'input' && v.secret) return 'secret';
  return null;
}
const staleOutputs = computed(() =>
  outputs.value
    .map((o) => ({ name: o, reason: staleReason(o, 'output') }))
    .filter((o) => o.reason)
);

function toggleOutput(varName: string, on: boolean) {
  outputs.value = on
    ? [...new Set([...outputs.value, varName])]
    : outputs.value.filter((o) => o !== varName);
}

function parseValue(text: string): unknown {
  const trimmed = text.trim();
  if (/^(-?\d|true$|false$|null$|\[|\{(?![{=])|")/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

const nameError = computed(() => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name.value))
    return t('builder.errors.namePattern');
  if (name.value !== props.name && props.takenNames.includes(name.value))
    return t('builder.errors.duplicateRunnable');
  return null;
});

const canSubmit = computed(
  () =>
    !nameError.value &&
    !!taskIdentifier.value &&
    inputs.value.every((i) => !!i.key) &&
    new Set(inputs.value.map((i) => i.key)).size === inputs.value.length
);

function submit() {
  if (!canSubmit.value) return;
  const base = {
    trigger: trigger.value,
    onSuccess: onSuccess.value,
    onError: onError.value,
  };
  const runnable: RunnableDraft =
    mode.value === 'run'
      ? {
          mode: 'run',
          ...base,
          inputs: Object.fromEntries(
            inputs.value.map((i) => [i.key, parseValue(i.value)])
          ),
          outputs: outputs.value,
          persist: persist.value,
          ...(confirm.value.trim() ? { confirm: confirm.value } : {}),
          onPaused: onPaused.value,
        }
      : {
          mode: 'history',
          ...base,
          source: source.value,
          filter: {
            mode: filterMode.value,
            ...(filterMode.value === 'range' && count.value.trim()
              ? { count: /^\d+$/.test(count.value.trim()) ? Number(count.value) : count.value }
              : {}),
            ...(filterMode.value === 'byId' && pipelineIdentifier.value
              ? { pipelineIdentifier: pipelineIdentifier.value }
              : {}),
            ...(filterMode.value === 'dateRange' && dateFrom.value
              ? { dateFrom: dateFrom.value }
              : {}),
            ...(filterMode.value === 'dateRange' && dateTo.value
              ? { dateTo: dateTo.value }
              : {}),
          },
          ...(source.value === 'actionResults' && actionIdentifier.value
            ? { actionIdentifier: actionIdentifier.value }
            : {}),
          ...(source.value === 'variables' && variableName.value
            ? { variableName: variableName.value }
            : {}),
        };
  emit('submit', {
    name: name.value,
    taskIdentifier: taskIdentifier.value,
    workflowName:
      props.workflows.find((w) => w.identifier === taskIdentifier.value)
        ?.name ?? name.value,
    runnable,
  });
}

/** Points the runnable at a workflow the host just created. */
function selectWorkflow(identifier: string) {
  taskIdentifier.value = identifier;
}

defineExpose({ submit, canSubmit, selectWorkflow });
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.runnable.name') }}</Label>
        <Input v-model="name" placeholder="loadInvoices" />
        <p v-if="name && nameError" class="text-xs text-destructive m-0">
          {{ nameError }}
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.runnable.mode') }}</Label>
        <Select v-model="mode">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="run">{{
              t('builder.runnable.modes.run')
            }}</SelectItem>
            <SelectItem value="history">{{
              t('builder.runnable.modes.history')
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
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
        <div class="flex items-center gap-3">
          <button
            v-if="taskIdentifier"
            type="button"
            class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            @click="emit('editWorkflow', taskIdentifier)"
          >
            <Pencil class="w-3 h-3" /> {{ t('builder.runnable.editWorkflow') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            @click="emit('createWorkflow')"
          >
            <Plus class="w-3 h-3" /> {{ t('builder.runnable.newWorkflow') }}
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>{{ t('builder.runnable.trigger') }}</Label>
        <Select v-model="trigger">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{{
              t('builder.runnable.triggers.manual')
            }}</SelectItem>
            <SelectItem value="load">{{
              t('builder.runnable.triggers.load')
            }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <!-- RUN -->
    <template v-if="mode === 'run'">
      <Separator />
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <Label>{{ t('builder.runnable.inputs') }}</Label>
          <Button
            size="sm"
            variant="ghost"
            class="h-6 px-2 text-xs"
            :disabled="!inputCandidates.length"
            @click="inputs.push({ key: '', value: '' })"
          >
            <Plus class="w-3 h-3 mr-1" /> {{ t('common.add') }}
          </Button>
        </div>
        <div
          v-for="(input, index) in inputs"
          :key="index"
          class="flex flex-wrap items-center gap-2"
        >
          <Select v-model="input.key">
            <SelectTrigger
              class="w-40 h-8 text-xs"
              :class="{ 'border-destructive': staleReason(input.key, 'input') }"
              ><SelectValue :placeholder="t('builder.runnable.variable')"
            /></SelectTrigger>
            <SelectContent>
              <SelectItem
                v-if="staleReason(input.key, 'input')"
                :value="input.key"
                disabled
                >{{ input.key }}</SelectItem
              >
              <SelectItem
                v-for="v in inputCandidates"
                :key="v.name"
                :value="v.name"
                >{{ v.name }}</SelectItem
              >
            </SelectContent>
          </Select>
          <BindingInput
            v-model="input.value"
            :suggestions="suggestions"
            class="flex-1"
            input-class="h-8 py-[7px] font-mono"
            placeholder="{= customerSelect.value =}"
            value-field
          />
          <Button
            size="icon"
            variant="ghost"
            class="h-7 w-7"
            @click="inputs.splice(index, 1)"
          >
            <Trash2 class="w-3.5 h-3.5 text-destructive" />
          </Button>
          <p
            v-if="staleReason(input.key, 'input')"
            class="basis-full text-xs text-destructive m-0"
          >
            <span class="font-mono">{{ input.key }}</span> —
            {{ t(`builder.runnable.stale.${staleReason(input.key, 'input')}`) }}
          </p>
        </div>
        <p class="text-xs text-muted-foreground m-0">
          {{
            taskIdentifier && !inputCandidates.length
              ? t('builder.runnable.noPublicVariables')
              : t('builder.runnable.inputsHint')
          }}
          <span v-if="hiddenCount">{{
            t('builder.runnable.privateHidden', { count: hiddenCount })
          }}</span>
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <Label>{{ t('builder.runnable.outputs') }}</Label>
        <div v-if="outputCandidates.length" class="grid grid-cols-2 gap-1.5">
          <label
            v-for="v in outputCandidates"
            :key="v.name"
            class="flex items-center gap-2 text-xs cursor-pointer"
          >
            <Checkbox
              :model-value="outputs.includes(v.name)"
              @update:model-value="(on) => toggleOutput(v.name, on === true)"
            />
            <span class="font-mono">{{ v.name }}</span>
          </label>
        </div>
        <div v-if="staleOutputs.length" class="flex flex-col gap-1.5">
          <label
            v-for="o in staleOutputs"
            :key="o.name"
            class="flex items-center gap-2 text-xs cursor-pointer text-destructive"
          >
            <Checkbox
              :model-value="true"
              @update:model-value="(on) => toggleOutput(o.name, on === true)"
            />
            <span class="font-mono">{{ o.name }}</span>
            <span>— {{ t(`builder.runnable.stale.${o.reason}`) }}</span>
          </label>
          <p class="text-xs text-destructive m-0">
            {{ t('builder.runnable.stale.outputsHint') }}
          </p>
        </div>
        <p class="text-xs text-muted-foreground m-0">
          {{ t('builder.runnable.outputsHint') }}
        </p>
      </div>

      <div class="flex items-center justify-between gap-3">
        <div>
          <Label>{{ t('builder.runnable.persist') }}</Label>
          <p class="text-xs text-muted-foreground m-0">
            {{ t('builder.runnable.persistHint') }}
          </p>
        </div>
        <Switch v-model="persist" />
      </div>

      <div class="flex flex-col gap-1.5">
        <Label
          >{{ t('builder.runnable.confirm') }}
          <span class="text-muted-foreground text-xs">{{
            t('common.optional')
          }}</span></Label
        >
        <BindingInput
          v-model="confirm"
          :suggestions="suggestions"
          size="default"
          :placeholder="t('builder.runnable.confirmPlaceholder')"
        />
      </div>
    </template>

    <!-- HISTORY -->
    <template v-else>
      <Separator />
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('builder.actionEdit.source') }}</Label>
          <Select v-model="source">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="actionResults">{{
                t('builder.actionEdit.actionResults')
              }}</SelectItem>
              <SelectItem value="variables">{{
                t('builder.actionEdit.variables')
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('builder.actionEdit.filterMode') }}</Label>
          <Select v-model="filterMode">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">{{
                t('builder.actionEdit.latestRun')
              }}</SelectItem>
              <SelectItem value="range">{{
                t('builder.actionEdit.lastNRuns')
              }}</SelectItem>
              <SelectItem value="byId">{{
                t('builder.actionEdit.byPipelineId')
              }}</SelectItem>
              <SelectItem value="dateRange">{{
                t('builder.actionEdit.dateRange')
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div v-if="filterMode === 'range'" class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.count') }}</Label>
        <BindingInput v-model="count" :suggestions="suggestions" size="default" placeholder="10" />
      </div>
      <div v-if="filterMode === 'byId'" class="flex flex-col gap-1.5">
        <Label>{{ t('builder.actionEdit.pipelineIdentifier') }}</Label>
        <BindingInput
          v-model="pipelineIdentifier"
          :suggestions="suggestions"
          size="default"
          :placeholder="t('builder.actionEdit.pipelineIdentifierPlaceholder')"
        />
      </div>
      <div v-if="filterMode === 'dateRange'" class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('builder.actionEdit.dateFrom') }}</Label>
          <BindingInput v-model="dateFrom" :suggestions="suggestions" size="default" placeholder="{= period.from =}" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t('builder.actionEdit.dateTo') }}</Label>
          <BindingInput v-model="dateTo" :suggestions="suggestions" size="default" placeholder="{= period.to =}" />
        </div>
        <p class="col-span-2 text-xs text-muted-foreground m-0">{{ t('builder.actionEdit.dateRangeHint') }}</p>
      </div>
      <div v-if="source === 'actionResults'" class="flex flex-col gap-1.5">
        <Label
          >{{ t('builder.actionEdit.actionIdentifier') }}
          <span class="text-muted-foreground text-xs">{{
            t('builder.actionEdit.optionalLeaveBlankAll')
          }}</span></Label
        >
        <Input
          v-model="actionIdentifier"
          :placeholder="t('builder.actionEdit.allActions')"
        />
      </div>
      <div v-else class="flex flex-col gap-1.5">
        <Label
          >{{ t('builder.actionEdit.variableName') }}
          <span class="text-muted-foreground text-xs">{{
            t('builder.actionEdit.optionalLeaveBlankAll')
          }}</span></Label
        >
        <Select v-model="variableName">
          <SelectTrigger
            ><SelectValue :placeholder="t('builder.actionEdit.allVariables')"
          /></SelectTrigger>
          <SelectContent>
            <SelectItem
              v-if="staleReason(variableName, 'read')"
              :value="variableName"
              disabled
              >{{ variableName }}</SelectItem
            >
            <SelectItem
              v-for="v in variables.filter((x) => !x.secret)"
              :key="v.name"
              :value="v.name"
              >{{ v.name }}</SelectItem
            >
          </SelectContent>
        </Select>
        <p
          v-if="staleReason(variableName, 'read')"
          class="text-xs text-destructive m-0 flex items-center gap-2"
        >
          <span>
            <span class="font-mono">{{ variableName }}</span> —
            {{ t(`builder.runnable.stale.${staleReason(variableName, 'read')}`) }}
          </span>
          <button
            type="button"
            class="text-primary hover:underline"
            @click="variableName = ''"
          >
            {{ t('builder.actionEdit.allVariables') }}
          </button>
        </p>
      </div>
      <p class="text-xs text-muted-foreground m-0">
        {{ t('builder.runnable.historyHint') }}
      </p>
    </template>

    <Separator />
    <ActionListEditor
      v-model="onSuccess"
      :label="t('builder.runnable.onSuccess')"
      handler
      :pages="pages"
      :runnables="runnables"
      :components="components"
    />
    <ActionListEditor
      v-model="onError"
      :label="t('builder.runnable.onError')"
      handler
      :pages="pages"
      :runnables="runnables"
      :components="components"
    />
    <template v-if="mode === 'run'">
      <ActionListEditor
        v-model="onPaused"
        :label="t('builder.runnable.onPaused')"
        handler
        :pages="pages"
        :runnables="runnables"
        :components="components"
      />
      <p class="text-xs text-muted-foreground m-0 -mt-2">
        {{ t('builder.runnable.onPausedHint') }}
      </p>
    </template>
  </div>
</template>

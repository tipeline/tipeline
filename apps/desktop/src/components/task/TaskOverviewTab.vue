<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Card from '@/components/Card.vue';
import HubSourceBlock from '@/components/hub/HubSourceBlock.vue';
import CopyButton from '@/components/CopyButton.vue';
import VariableForm from '@/components/forms/VariableForm.vue';
import { useTaskExecution } from '@/composables/useTaskExecution';
import { Button } from '@/components/ui/button';
import { Loader2Icon, PlayIcon, HistoryIcon, SlidersHorizontalIcon, ChevronDownIcon } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'vue-router';
import { hasStepCache } from '@/utils/stepCache';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { useTimezone } from '@/composables/useTimezone';
import { hasFlowOrderingErrors, hasFlowFieldErrors } from '@/utils/flowValidation';
import { usePluginStore } from '@/store/pluginStore';
import { NON_EDITABLE_FIELD_TYPES } from '@tipeline/schemas';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Workflow, LayoutGrid } from 'lucide-vue-next';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { toast } from '@/components/ui/sonner';
import { toAssetUrl } from '@/utils/assetUrl';
import { renderMarkdown } from '@/utils/appMarkdown';
import { descriptionSummary } from '@tipeline/utils';
import { useWorkflowUsage } from '@/composables/useWorkflowUsage';
import DraftBanner from '@/components/task/DraftBanner.vue';
import TaskSchedulesCard from '@/components/schedule/TaskSchedulesCard.vue';
import { formatStepDuration } from '@/utils/runSteps';
import CapabilityChips from '@/components/task/CapabilityChips.vue';
import type { CapabilityReport } from '@/utils/capabilities';

const HIDDEN_FIELD_VISIBILITIES = ['private', 'protected'];

type VariableFormInstance = InstanceType<typeof VariableForm>;
const variableFormRef = ref<VariableFormInstance | null>(null);

const router = useRouter();
const { t } = useI18n();
const pluginStore = usePluginStore();
const props = defineProps<{ task: any }>();

const { isRunning, executeTask, events } = useTaskExecution();
const { appTimezone } = useTimezone();

const parsedSource = computed(() => {
  if (props.task?.source) {
    try {
      return JSON.parse(props.task.source);
    } catch {
      return null;
    }
  }
  return null;
});

// The description is Markdown: one plain line under the name, rendered in full below.
const descriptionLine = computed(() => descriptionSummary(parsedSource.value?.description));
const descriptionHtml = computed(() => renderMarkdown(parsedSource.value?.description ?? ''));

const formFields = computed(() => parsedSource.value?.pipeline?.variables ?? []);
// Fields VariableForm will actually render (it hides non-editable types and private/protected vars);
// used to decide whether to show the form or the empty state, since formFields alone overcounts.
const visibleFormFields = computed(() =>
  formFields.value.filter(
    (f: any) =>
      !(NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(f.type) &&
      !HIDDEN_FIELD_VISIBILITIES.includes(f.visibility ?? 'private') &&
      !f.output
  )
);
// Set by Core when the assistant drafted this workflow; it stays after the draft is marked ready.
const draftedByAssistant = computed(() => {
  const raw = props.task?.metadata;
  if (!raw) return false;
  try {
    return (typeof raw === 'string' ? JSON.parse(raw) : raw)?.draftedBy === 'assistant';
  } catch {
    return false;
  }
});
// A draft can't be scheduled; marking it ready in the banner unlocks the Schedules card.
const markedReady = ref(false);
watch(
  () => props.task?.identifier,
  () => {
    markedReady.value = false;
  }
);
const isDraft = computed(() => {
  if (markedReady.value) return false;
  const raw = props.task?.metadata;
  if (!raw) return false;
  try {
    return (typeof raw === 'string' ? JSON.parse(raw) : raw)?.draft === true;
  } catch {
    return false;
  }
});
const schedulesCardRef = ref<InstanceType<typeof TaskSchedulesCard> | null>(null);
function onDraftReady() {
  markedReady.value = true;
  schedulesCardRef.value?.reload();
}
const actionCount = computed(() => parsedSource.value?.pipeline?.actions?.length ?? 0);

// What the workflow can do outside the run; Core follows its sub-workflows too.
const capabilities = ref<CapabilityReport | null>(null);
watch(
  () => [props.task?.identifier, props.task?.source],
  async ([identifier]) => {
    if (!identifier) return;
    try {
      capabilities.value = await invokeCore<CapabilityReport>(SEND.TASK_CAPABILITIES, { identifier });
    } catch {
      capabilities.value = null;
    }
  },
  { immediate: true }
);
const taskImageUrl = computed(() => toAssetUrl(props.task?.metadata?.image));
const hasOrderingErrors = computed(() => {
  const actions = parsedSource.value?.pipeline?.actions ?? [];
  return hasFlowOrderingErrors(actions) || hasFlowFieldErrors(actions, pluginStore.pluginParams, pluginStore.pluginRules);
});

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  try {
    return format(new TZDate(new Date(date), appTimezone.value), 'MMM d, yyyy HH:mm');
  } catch {
    return date;
  }
}

// How the next run uses the result cache — chosen from the menu beside Run.
const runCacheMode = ref<'bypass' | 'refresh' | undefined>(undefined);

// The menu only changes anything when a step is cached (see hasStepCache).
const hasCacheSettings = computed(() => hasStepCache(parsedSource.value?.pipeline?.actions));

function handleRunTask(cache?: 'bypass' | 'refresh') {
  runCacheMode.value = cache;
  if (visibleFormFields.value.length === 0) {
    executeTask(props.task.identifier as string, {}, false, false, cache);
  } else {
    variableFormRef.value?.submit();
  }
}

// The newest run, shown beside Run so the result is visible without opening Runs.
const lastRun = ref<any | null>(null);
watch(
  () => props.task?.identifier,
  async (identifier) => {
    lastRun.value = null;
    if (!identifier) return;
    try {
      const runs = await invokeCore<any[]>(SEND.PIPELINE_LIST, { taskIdentifier: identifier, limit: 1, offset: 0 });
      lastRun.value = runs?.[0] ?? null;
    } catch {
      lastRun.value = null;
    }
  },
  { immediate: true }
);
const LAST_RUN_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-blue-500',
  paused: 'bg-amber-500',
};
const lastRunStatus = computed(() => {
  const status = lastRun.value?.status ?? 'pending';
  const key = `taskHistory.${status}`;
  return t(key) !== key ? t(key) : status;
});
const lastRunDuration = computed(() => {
  const start = Date.parse(lastRun.value?.started_at ?? '');
  const end = Date.parse(lastRun.value?.finished_at ?? '');
  return Number.isFinite(start) && Number.isFinite(end) ? formatStepDuration(Math.max(0, end - start)) : null;
});

function openLastRun() {
  router.push(`/tasks/${props.task.identifier}/pipelines/${lastRun.value.identifier}`);
}

function goToHistory() {
  router.push(`/tasks/${props.task.identifier}/pipelines`);
}

// Redirect to the new pipeline as soon as the start event carries its identifier
watch(
  events,
  (newEvents) => {
    const startEvent = newEvents.find((e) => e.type === 'start' && e.pipelineIdentifier);
    if (startEvent?.pipelineIdentifier) {
      router.push(`/tasks/${props.task.identifier}/pipelines/${startEvent.pipelineIdentifier}`);
    }
  },
  { deep: true }
);

const onRun = (data: any) => {
  executeTask(props.task.identifier as string, data, false, false, runCacheMode.value);
};

// Tags (read-only display)
const tags = computed<string[]>(() => {
  const raw = props.task?.tags;
  return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
});

// The apps and workflows that use this workflow — the same workflow can serve them in
// several projects while it lives in one. Its schedules have their own card below.
const { usage } = useWorkflowUsage(() => props.task?.identifier);

// The task was installed from a hub and may have another version available.
const isFromHub = computed(() => props.task?.source_type === 'hub');
const updateAvailable = computed(
  () =>
    isFromHub.value &&
    (props.task?.hub_status ?? 'ok') === 'ok' &&
    ['available', 'major'].includes(props.task?.hub_update_state)
);
</script>

<template>
  <div class="flex flex-col h-full w-full">
    <DraftBanner :task="task" class="mb-4 rounded-md border" @ready="onDraftReady" />
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 h-full overflow-hidden">
      <!-- Left: Run Task -->
      <div class="space-y-4 col-span-1 lg:col-span-7 flex flex-col h-full overflow-hidden">
        <Card class="flex-1 min-h-0 flex flex-col">
          <template #title>{{ t('tasks.overview.run') }}</template>
          <template #content>
            <div class="overflow-y-auto h-full">
              <VariableForm
                v-if="visibleFormFields.length > 0"
                :fields="formFields"
                columns
                @submit="onRun"
                ref="variableFormRef"
              />
              <div
                v-else
                class="flex flex-col items-center justify-center h-full text-center py-10 text-muted-foreground"
              >
                <SlidersHorizontalIcon class="w-12 h-12 mb-3 opacity-30" />
                <p class="text-sm font-medium">{{ t('tasks.overview.noInputTitle') }}</p>
                <p class="text-xs mt-1 opacity-70">{{ t('tasks.overview.noInput') }}</p>
              </div>
            </div>
          </template>
          <template #footer>
            <div class="flex flex-wrap items-center justify-between gap-2 w-full">
              <div class="flex gap-2">
                <Button
                  v-if="!isRunning"
                  :disabled="hasOrderingErrors"
                  @click="handleRunTask()"
                >
                  <PlayIcon class="w-4 h-4" />
                  {{ t('tasks.overview.runTask') }}
                </Button>
                <DropdownMenu v-if="!isRunning && hasCacheSettings">
                  <DropdownMenuTrigger as-child>
                    <Button variant="outline" size="icon" :disabled="hasOrderingErrors" :title="t('cache.runOptions')">
                      <ChevronDownIcon class="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem class="cursor-pointer" @click="handleRunTask('bypass')">
                      {{ t('cache.runWithoutCache') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="cursor-pointer" @click="handleRunTask('refresh')">
                      {{ t('cache.runAndRefresh') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button v-if="isRunning" variant="outline" @click="goToHistory">
                  <Loader2Icon class="w-4 h-4 animate-spin" />
                  {{ t('tasks.overview.viewRunning') }}
                </Button>
              </div>
              <div class="flex items-center gap-2 min-w-0 text-[12.5px] text-muted-foreground" data-testid="overview-last-run">
                <button
                  v-if="lastRun"
                  class="inline-flex items-center gap-1.5 min-w-0 hover:text-foreground"
                  :title="lastRunStatus"
                  @click="openLastRun"
                >
                  <span class="size-2 rounded-full shrink-0" :class="LAST_RUN_DOT[lastRun.status] ?? 'bg-gray-400'" />
                  <span class="truncate">
                    {{ t('tasks.overview.lastRunAt', { when: formatDate(lastRun.started_at) }) }}
                    <span v-if="lastRunDuration" class="tabular-nums">· {{ lastRunDuration }}</span>
                  </span>
                </button>
                <span v-else>{{ t('tasks.overview.notRunYet') }}</span>
                <button
                  class="inline-flex items-center gap-1 underline underline-offset-2 decoration-border hover:decoration-current hover:text-foreground"
                  @click="goToHistory"
                >
                  <HistoryIcon class="size-3.5" />
                  {{ t('tasks.overview.viewRuns') }}
                </button>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <!-- Right: Info -->
      <div class="col-span-1 lg:col-span-5 h-full flex flex-col overflow-y-auto scroll-fade">
        <!-- Details -->
        <Card class="shrink-0 flex flex-col">
          <template #title>{{ t('tasks.overview.about') }}</template>
          <template #content>
            <div v-if="parsedSource" class="flex flex-col gap-4">
              <div class="flex items-center gap-3 shrink-0">
                <div class="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0 border">
                  <img v-if="taskImageUrl" :src="taskImageUrl" class="w-full h-full object-cover" />
                  <Workflow v-else class="size-5 text-muted-foreground/40" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate">{{ props.task.name }}</div>
                  <div class="text-xs text-muted-foreground truncate">{{ descriptionLine || '—' }}</div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4 shrink-0">
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.identifier') }}
                  </div>
                  <div class="flex items-center gap-1.5 min-w-0">
                    <div class="text-sm font-mono truncate">{{ props.task.identifier }}</div>
                    <CopyButton :value="props.task.identifier" />
                  </div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.project') }}
                  </div>
                  <div v-if="props.task.project_identifier" class="flex items-center gap-2 min-w-0">
                    <span
                      v-if="props.task.project_color"
                      class="w-2.5 h-2.5 rounded-full shrink-0"
                      :style="{ backgroundColor: props.task.project_color }"
                    />
                    <button
                      class="text-sm hover:underline text-left truncate"
                      @click="router.push(`/projects/${props.task.project_identifier}`)"
                    >
                      {{ props.task.project_name }}
                    </button>
                  </div>
                  <div v-else class="text-sm text-muted-foreground">—</div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.version') }}
                  </div>
                  <div class="text-sm flex items-center gap-1.5">
                    {{ parsedSource.version ?? '—' }}
                    <Badge v-if="updateAvailable" variant="secondary" class="text-xs">
                      {{ t('hub.updateAvailable') }}
                    </Badge>
                  </div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.author') }}
                  </div>
                  <div class="text-sm">{{ parsedSource.author ?? '—' }}</div>
                  <div v-if="draftedByAssistant" class="text-xs text-muted-foreground">
                    {{ t('tasks.overview.draftedByAssistant') }}
                  </div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.actions') }}
                  </div>
                  <div class="text-sm">{{ actionCount }}</div>
                </div>
                <div v-if="parsedSource.helper === true" class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.helper.badge') }}
                  </div>
                  <div class="text-xs text-muted-foreground">{{ t('tasks.helper.explain') }}</div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.platform') }}
                  </div>
                  <div class="text-sm">{{ parsedSource.platform ?? '—' }}</div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.created') }}
                  </div>
                  <div class="text-sm">{{ formatDate(props.task.created_at) }}</div>
                </div>
                <div class="space-y-1">
                  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {{ t('tasks.overview.updated') }}
                  </div>
                  <div class="text-sm">{{ formatDate(props.task.updated_at) }}</div>
                </div>
                <HubSourceBlock
                  v-if="isFromHub"
                  :item="props.task"
                  type="task"
                  @changed="(fields) => Object.assign(props.task, fields)"
                />
              </div>

              <div v-if="capabilities" class="space-y-1.5 shrink-0">
                <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {{ t('capabilities.canAccess') }}
                </div>
                <CapabilityChips :report="capabilities" />
              </div>

              <div v-if="parsedSource.description" class="space-y-1">
                <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  {{ t('tasks.overview.description') }}
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
                <div class="app-markdown text-sm max-h-72 overflow-y-auto scroll-fade pr-1" v-html="descriptionHtml" />
              </div>

              <div v-if="tags.length > 0" class="space-y-1.5 shrink-0">
                <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {{ t('tasks.overview.tags') }}
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="tag in tags"
                    :key="tag"
                    type="button"
                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    :title="t('tag.showWorkflows')"
                    @click="router.push({ path: '/tasks', query: { tags: tag } })"
                  >
                    {{ tag }}
                  </button>
                </div>
              </div>

              <div v-if="usage.apps.length + usage.workflows.length > 0" class="space-y-1.5 shrink-0">
                <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {{ t('tasks.overview.usedBy') }}
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="app in usage.apps"
                    :key="`app:${app.identifier}`"
                    type="button"
                    class="inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded border text-xs hover:bg-accent transition-colors"
                    :title="app.project_name ? t('tasks.overview.usedByInProject', { project: app.project_name }) : undefined"
                    @click="router.push(`/apps/${app.identifier}`)"
                  >
                    <LayoutGrid class="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span class="truncate">{{ app.name }}</span>
                    <span
                      v-if="app.project_color"
                      class="w-2 h-2 rounded-full shrink-0"
                      :style="{ backgroundColor: app.project_color }"
                    />
                  </button>
                  <button
                    v-for="caller in usage.workflows"
                    :key="`workflow:${caller.identifier}`"
                    type="button"
                    class="inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded border text-xs hover:bg-accent transition-colors"
                    :title="caller.project_name ? t('tasks.overview.calledByInProject', { project: caller.project_name }) : t('tasks.overview.calledBy')"
                    @click="router.push(`/tasks/${caller.identifier}`)"
                  >
                    <Workflow class="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span class="truncate">{{ caller.name }}</span>
                    <span
                      v-if="caller.project_color"
                      class="w-2 h-2 rounded-full shrink-0"
                      :style="{ backgroundColor: caller.project_color }"
                    />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </Card>

        <TaskSchedulesCard
          v-if="task?.identifier"
          ref="schedulesCardRef"
          class="mt-4"
          :task-identifier="task.identifier"
          :task-name="task.name"
          :draft="isDraft"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { generateIdentifier } from '@tipeline/utils';
import { Loader2, Trash2 } from 'lucide-vue-next';
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import { Button } from '@/components/ui/button';
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
import type { ColumnDef } from '@tanstack/vue-table';
import { useRouter } from 'vue-router';
import { useStreamListener } from '@/composables/useStreamListener';
import { useStream } from '@/composables/useStream';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useStreamStore } from '@/store/stream';
import { toast } from '@/components/ui/sonner';
import {
  createColumns,
  isAwaitingApproval,
  type TaskHistoryItem,
} from '@/config/tables/TaskHistoryTab';

type Item = TaskHistoryItem;

const props = defineProps<{ task: any }>();

const router = useRouter();
const { t } = useI18n();

const PAGE_SIZE = 30;

const resultPipelines = ref<Item[]>([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const error = ref<string | null>(null);
const hasMore = ref(true);
const loadedCount = ref(0);
const resumingIdentifier = ref<string | null>(null);
const decidingIdentifier = ref<string | null>(null);

async function fetchPipelines(offset: number): Promise<Item[]> {
  const result = await window.ipcRenderer.invoke(SEND.PIPELINE_LIST, {
    correlationId: generateIdentifier(),
    payload: { taskIdentifier: props.task.identifier, limit: PAGE_SIZE, offset },
  });
  return result ?? [];
}

async function loadPipelines() {
  isLoading.value = true;
  error.value = null;
  try {
    const items = await fetchPipelines(0);
    resultPipelines.value = items;
    loadedCount.value = items.length;
    hasMore.value = items.length === PAGE_SIZE;
  } catch (e: any) {
    error.value = e?.message ?? 'Unknown error';
  } finally {
    isLoading.value = false;
  }
}

async function loadMore() {
  if (isLoadingMore.value || !hasMore.value) return;
  isLoadingMore.value = true;
  try {
    const items = await fetchPipelines(loadedCount.value);
    resultPipelines.value = [...resultPipelines.value, ...items];
    loadedCount.value += items.length;
    hasMore.value = items.length === PAGE_SIZE;
  } catch (e: any) {
    error.value = e?.message ?? 'Unknown error';
  } finally {
    isLoadingMore.value = false;
  }
}

onMounted(loadPipelines);

// Live events (below) cover the common case, but a detached background run —
// e.g. a `subtask.exec(async: true)` child, which gets its own correlationId
// with no live listener attached (see docs/architecture/execution-flow.md) —
// finishes with no `end` event ever reaching this page. Without this, its row
// stays stuck on "running" until the next mount. Poll while anything here is
// running so it self-heals without a manual refresh.
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Runs waiting for approval are polled too: they can be decided elsewhere (an app's
// Approvals component) and then resume.
const hasRunningRows = computed(() =>
  resultPipelines.value.some(
    (p) => p.status === 'running' || p.status === 'pending' || isAwaitingApproval(p)
  )
);

async function pollRunningStatuses() {
  try {
    const items = await fetchPipelines(0);
    const byIdentifier = new Map(items.map((item) => [item.identifier, item]));
    resultPipelines.value = resultPipelines.value.map((pipeline) => {
      const fresh = byIdentifier.get(pipeline.identifier);
      return fresh
        ? { ...pipeline, status: fresh.status, finished_at: fresh.finished_at, metadata: fresh.metadata }
        : pipeline;
    });
  } catch {
    // Best-effort refresh — live events remain the primary update path, so a
    // failed poll just tries again next tick.
  }
}

watch(
  hasRunningRows,
  (running) => {
    if (running && !pollTimer) {
      pollTimer = setInterval(pollRunningStatuses, 5000);
    } else if (!running && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

const openClearHistory = ref(false);
const isClearing = ref(false);

async function confirmClearHistory() {
  isClearing.value = true;
  try {
    const result = await invokeCore<{ deleted: number; identifiers: string[] }>(SEND.PIPELINE_CLEAR, {
      taskIdentifier: props.task.identifier,
    });
    useStreamStore().removeEventsForPipelines(result.identifiers);
    openClearHistory.value = false;
    toast.success(t('taskHistory.clearSuccess', { count: result.deleted }));
    await loadPipelines();
  } catch (e: any) {
    toast.error(e?.message ?? t('common.unknownError'));
  } finally {
    isClearing.value = false;
  }
}

const { execute: executeResume, events: resumeEvents } = useStream();

function resumePipeline(pipelineIdentifier: string) {
  resumingIdentifier.value = pipelineIdentifier;
  executeResume(SEND.PIPELINE_RESUME, { pipelineIdentifier, variables: {} });
}

watch(resumeEvents, (newEvents) => {
  const latest = newEvents[newEvents.length - 1];
  if (!latest) return;
  if (latest.type === 'error') {
    const msg = typeof latest.error === 'string'
      ? latest.error
      : latest.error?.message ?? t('common.unknownError');
    toast.error(t('tasks.resumeFailed'), { description: msg });
    resumingIdentifier.value = null;
  } else if (latest.type === 'end_all') {
    resumingIdentifier.value = null;
  }
}, { deep: true });

async function decideApproval(pipelineIdentifier: string, approved: boolean) {
  decidingIdentifier.value = pipelineIdentifier;
  try {
    await invokeCore(SEND.APPROVAL_DECIDE, { pipelineIdentifier, approved, decidedBy: 'desktop' });
    toast.success(t(approved ? 'taskHistory.approvedToast' : 'taskHistory.rejectedToast'));
    resultPipelines.value = resultPipelines.value.map((p) =>
      p.identifier === pipelineIdentifier ? { ...p, status: 'running' } : p
    );
  } catch (e: any) {
    toast.error(t('apps.approvals.decideFailed'), { description: e?.message ?? t('common.unknownError') });
  } finally {
    decidingIdentifier.value = null;
    await pollRunningStatuses();
  }
}

const columns = computed<ColumnDef<TaskHistoryItem>[]>(() =>
  createColumns(
    t,
    router,
    props.task.identifier,
    resumePipeline,
    resumingIdentifier,
    decideApproval,
    decidingIdentifier,
    () => void pollRunningStatuses()
  )
);

const { events } = useStreamListener(props.task.identifier);
// 'error' broadcasts carry no taskIdentifier/pipelineIdentifier (the backend's
// IPCMessage.failure() has no data payload), so they never pass the task-scoped
// filter above. They do carry the same correlationId as the matching 'end' event
// though, so pull them from the unfiltered stream to know which runs actually failed.
const { events: allEvents } = useStreamListener();

watch(
  [events, allEvents],
  ([newEvents]) => {
    if (newEvents.length === 0) return;
    resultPipelines.value = updatePipelinesFromEvents(resultPipelines.value, newEvents, allEvents.value);
  },
  { deep: true }
);

const seenPausedEnds = new Set<string>();

function updatePipelinesFromEvents(
  currentPipelines: Item[],
  streamEvents: any[],
  globalEvents: any[]
): Item[] {
  // 'end' fires unconditionally in a `finally` block on both success and failure —
  // it only means "this attempt is over", not "it succeeded". The real outcome is
  // signaled by a separate 'error' event sharing the same correlationId.
  const failedCorrelationIds = new Set(
    globalEvents.filter((e) => e.type === 'error').map((e) => e.correlationId)
  );
  // Create a map for quick lookup
  const pipelineMap = new Map<string, Item>();

  // Add existing pipelines to the map
  currentPipelines.forEach((pipeline) => {
    pipelineMap.set(pipeline.identifier, { ...pipeline });
  });

  // Process events chronologically
  const sortedEvents = [...streamEvents].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  sortedEvents.forEach((event) => {
    const pipelineId = event.pipelineIdentifier;

    if (event.type === 'start') {
      // Only add if it doesn't exist already (avoid overwriting DB data)
      if (!pipelineMap.has(pipelineId)) {
        pipelineMap.set(pipelineId, {
          identifier: pipelineId,
          status: 'running',
          started_at: new Date(event.timestamp).toISOString(),
          finished_at: null,
        });
      } else {
        // Update status to running if it exists but status might be stale
        const existing = pipelineMap.get(pipelineId)!;
        if (existing.status !== 'completed') {
          existing.status = 'running';
        }
      }
    } else if (event.type === 'action') {
      // If we receive a action event for a pipeline we don't know about,
      // it means it's running
      if (!pipelineMap.has(pipelineId)) {
        pipelineMap.set(pipelineId, {
          identifier: pipelineId,
          status: 'running',
          started_at: new Date(event.timestamp).toISOString(),
          finished_at: null,
        });
      }
    } else if (event.type === 'end' && (event.data?.status === 'paused' || event.data?.status === 'canceled')) {
      // Stopped at an approval step, or canceled (a rejected approval, or someone canceled
      // the run). Events are re-applied on every update, so this only asks once for the
      // stored status (with its details) instead of forcing it over a change made since.
      const key = `${event.correlationId}:${event.timestamp}`;
      if (!seenPausedEnds.has(key)) {
        seenPausedEnds.add(key);
        void pollRunningStatuses();
      }
    } else if (event.type === 'end') {
      const status = failedCorrelationIds.has(event.correlationId) ? 'failed' : 'completed';
      const pipeline = pipelineMap.get(pipelineId);
      if (pipeline) {
        pipeline.status = status;
        pipeline.finished_at = new Date(event.timestamp).toISOString();
      } else {
        // If we receive an end event for a pipeline we don't know about,
        // create it now (edge case)
        pipelineMap.set(pipelineId, {
          identifier: pipelineId,
          status,
          started_at: new Date(event.timestamp).toISOString(),
          finished_at: new Date(event.timestamp).toISOString(),
        });
      }
    }
  });

  return Array.from(pipelineMap.values());
}

// Sort pipelines by started_at descending (newest first)
const sortedPipelines = computed(() =>
  [...resultPipelines.value].sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )
);

</script>

<template>
  <Card classContent="p-0" class="h-full gap-2 pb-2">
    <template #title>{{ t('taskHistory.title') }}</template>
    <template #actions>
      <Button
        variant="destructive"
        size="sm"
        :disabled="isLoading || sortedPipelines.length === 0"
        @click="openClearHistory = true"
      >
        <Trash2 class="w-4 h-4" />
        {{ t('taskHistory.clearHistory') }}
      </Button>
    </template>

    <template #content>
      <div
        v-if="isLoading"
        class="flex items-center justify-center py-8 text-muted-foreground text-sm"
      >
        {{ t('runs.loading') }}
      </div>

      <div
        v-else-if="error"
        class="flex items-center justify-center py-8 text-destructive text-sm"
      >
        {{ error }}
      </div>

      <DataTable
        v-else
        :columns="columns"
        :data="sortedPipelines"
        :flat="true"
        :hidden-columns="['status']"
        :filters="[
          {
            column: 'status',
            placeholder: t('tasks.history.filterByStatus'),
            type: 'select',
            options: [
              { label: t('tasks.history.running'), value: 'running' },
              { label: t('tasks.history.completed'), value: 'completed' },
              { label: t('tasks.history.pending'), value: 'pending' },
              { label: t('tasks.history.failed'), value: 'failed' },
              { label: t('taskHistory.paused'), value: 'paused' },
              { label: t('taskHistory.canceled'), value: 'canceled' },
            ],
          },
        ]"
      />
    </template>

    <template v-if="!isLoading && !error && hasMore" #footer>
      <div class="flex w-full justify-center">
        <Button
          variant="ghost"
          size="sm"
          class="h-7 px-3 text-xs text-muted-foreground"
          :disabled="isLoadingMore"
          @click="loadMore"
        >
          <Loader2 v-if="isLoadingMore" class="w-3 h-3 mr-1.5 animate-spin" />
          {{ isLoadingMore ? t('runs.loadingMore') : t('runs.loadMore') }}
        </Button>
      </div>
    </template>
  </Card>

  <AlertDialog v-model:open="openClearHistory">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('taskHistory.clearAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('taskHistory.clearAlert.description', { name: props.task.name }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isClearing">{{ t('taskHistory.clearAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isClearing" @click="confirmClearHistory">
          <Loader2 v-if="isClearing" class="w-4 h-4 mr-1.5 animate-spin" />
          {{ t('taskHistory.clearAlert.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { generateIdentifier } from '@tipeline/utils';
import { Loader2, Trash2 } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import Card from '@/components/Card.vue';
import DataTable from '@/components/DataTable.vue';
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
import { useRoute, useRouter } from 'vue-router';
import { useStreamListener } from '@/composables/useStreamListener';
import { createColumns } from '@/config/tables/ActivityTable';
import { type Item } from '@/config/tables/HomeRecentActivity';
import { mergeRunEvents } from '@/utils/mergeRunEvents';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useStreamStore } from '@/store/stream';
import { toast } from '@/components/ui/sonner';
import { useConnectionStore } from '@/store/connectionStore';
import { formatDistanceToNow } from 'date-fns';
import SelectionBar from '@/components/SelectionBar.vue';
import BulkDeleteDialog from '@/components/BulkDeleteDialog.vue';
import type { BulkDeleteItem } from '@/utils/bulkDelete';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const connectionStore = useConnectionStore();

const PAGE_SIZE = 30;

const initialFilters = typeof route.query.status === 'string'
  ? [{ id: 'status', value: route.query.status }]
  : [];

// Runs load a page at a time, so the status filter goes to Core: filtering only the
// loaded page would hide older failed runs (the dashboard's "Failed today" opens here).
const statusFilter = ref<string | undefined>(
  typeof route.query.status === 'string' ? route.query.status : undefined
);

const pipelineData = ref<Item[]>([]);
const isLoading = ref(true);
const isLoadingMore = ref(false);
const error = ref<string | null>(null);
const hasMore = ref(true);
const loadedCount = ref(0);

async function fetchPipelines(offset: number): Promise<Item[]> {
  const result = await window.ipcRenderer.invoke(SEND.PIPELINE_LIST, {
    correlationId: generateIdentifier(),
    payload: { limit: PAGE_SIZE, offset, status: statusFilter.value },
  });
  return result ?? [];
}

async function loadPipelines() {
  isLoading.value = true;
  error.value = null;
  try {
    const items = await fetchPipelines(0);
    pipelineData.value = items;
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
    pipelineData.value = [...pipelineData.value, ...items];
    loadedCount.value += items.length;
    hasMore.value = items.length === PAGE_SIZE;
  } catch (e: any) {
    error.value = e?.message ?? 'Unknown error';
  } finally {
    isLoadingMore.value = false;
  }
}

function onFiltersChange(filters: { id: string; value: unknown }[]) {
  const value = filters.find((f) => f.id === 'status')?.value;
  const status = typeof value === 'string' && value ? value : undefined;
  if (status === statusFilter.value) return;
  statusFilter.value = status;
  void loadPipelines();
}

const { events } = useStreamListener();

// Pipeline audit records keyed by pipeline_id — only populated on server connections
interface AuditEntry {
  pipeline_id: string | null;
  triggered_by_type: 'user' | 'webhook' | 'schedule';
  triggered_by_name: string | null;
}
const auditMap = ref<Map<string, AuditEntry>>(new Map());

async function loadAudit() {
  const conn = connectionStore.activeConnection;
  if (!conn) return;
  try {
    const records: AuditEntry[] = await window.ipcRenderer.invoke(SEND.SERVER_PIPELINE_AUDIT_LIST, {
      host: conn.host,
      token: conn.token,
      limit: 200,
    });
    auditMap.value = new Map(
      records.filter((r) => r.pipeline_id).map((r) => [r.pipeline_id!, r])
    );
  } catch {
    // Server unreachable — degrade gracefully, no trigger badges shown
  }
}

onMounted(() => {
  loadPipelines();
  if (connectionStore.isRemote) loadAudit();
});

watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !connectionStore.isRemote) return;
    if (latest.type === 'start' || latest.type === 'end' || latest.type === 'error') {
      loadAudit();
    }
  }
);

const columns = computed<ColumnDef<Item>[]>(() =>
  createColumns(t, router, connectionStore.isRemote, () => void pollPipelines())
);

const sortedPipelines = computed<Item[]>(() => {
  const sorted = mergeRunEvents(pipelineData.value ?? [], events.value);

  // Enrich with audit data when connected to a server
  if (!connectionStore.isRemote || auditMap.value.size === 0) return sorted;
  return sorted.map((p) => {
    const audit = auditMap.value.get(p.identifier);
    if (!audit) return p;
    return {
      ...p,
      triggered_by_type: audit.triggered_by_type,
      triggered_by_name: audit.triggered_by_name,
    };
  });
});

// A pipeline only appears above via the initial fetch or a live 'start'/'action'
// event. A detached run (e.g. a `subtask.exec(async: true)` child) has no
// TaskStreamListener wired up for its correlationId, so it never broadcasts at
// all — it would stay invisible here until the page is remounted.
//
// Gating this poll on "something already-known is still running" was tried
// and rejected: the parent (and any other already-discovered row) can settle
// before the async child's own row is ever first fetched, since its DB row
// often doesn't exist yet at mount time either — that stops polling before
// the row is ever discovered, not just before it updates. So this polls
// unconditionally at a modest interval for as long as the page is open.
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollPipelines() {
  try {
    const fresh = await fetchPipelines(0);
    const byIdentifier = new Map(pipelineData.value.map((p) => [p.identifier, p]));
    for (const item of fresh) byIdentifier.set(item.identifier, item);
    pipelineData.value = Array.from(byIdentifier.values());
  } catch {
    // Best-effort refresh — live events remain the primary update path, so a
    // failed poll just tries again next tick.
  }
}

onMounted(() => {
  pollTimer = setInterval(pollPipelines, 8000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

const selection = ref<string[]>([]);
const bulkDeleteOpen = ref(false);
const selectedRuns = computed(() =>
  sortedPipelines.value.filter((run) => selection.value.includes(run.identifier))
);
const selectedItems = computed<BulkDeleteItem[]>(() =>
  selectedRuns.value.map((run) => ({
    key: run.identifier,
    name: `${run.task_name ?? run.task_identifier ?? run.identifier} · ${formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}`,
    warning: run.status === 'running' ? t('runs.bulkDelete.stillRunning') : undefined,
  }))
);
const runningCount = computed(() => selectedRuns.value.filter((run) => run.status === 'running').length);

// Core skips runs that are still running, the same as Clear history.
async function removeRuns(items: BulkDeleteItem[]) {
  const result = await invokeCore<{ deleted: number; identifiers: string[] }>(SEND.PIPELINE_DELETE, {
    identifiers: items.map((item) => item.key),
  });
  useStreamStore().removeEventsForPipelines(result.identifiers);
  return { deleted: result.identifiers, failed: [], skipped: items.length - result.deleted };
}

function onRunsDeleted(identifiers: string[]) {
  const gone = new Set(identifiers);
  const before = pipelineData.value.length;
  pipelineData.value = pipelineData.value.filter((run) => !gone.has(run.identifier));
  // "Load more" pages by offset, and the deleted rows no longer count in Core.
  loadedCount.value = Math.max(0, loadedCount.value - (before - pipelineData.value.length));
}

const openClearHistory = ref(false);
const isClearing = ref(false);

async function confirmClearHistory() {
  isClearing.value = true;
  try {
    const result = await invokeCore<{ deleted: number; identifiers: string[] }>(SEND.PIPELINE_CLEAR_ALL);
    useStreamStore().removeEventsForPipelines(result.identifiers);
    openClearHistory.value = false;
    toast.success(t('runs.clearSuccess', { count: result.deleted }));
    await loadPipelines();
  } catch (e: any) {
    toast.error(e?.message ?? t('common.unknownError'));
  } finally {
    isClearing.value = false;
  }
}
</script>

<template>
  <Page>
    <template #title>{{ t('runs.title') }}</template>
    <template #description>{{ t('runs.description') }}</template>

    <template #content>
      <Card classContent="p-0" class="h-full gap-2 pb-2">
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
            :animated="true"
            :hidden-columns="['status', 'finished_at']"
            :initial-filters="initialFilters"
            @filters-change="onFiltersChange"
            selectable
            :row-key="(run: Item) => run.identifier"
            v-model:selection="selection"
            :filters="[
              {
                column: 'status',
                placeholder: t('runs.filterStatus'),
                type: 'select',
                options: [
                  { label: t('runs.running'), value: 'running' },
                  { label: t('runs.completed'), value: 'completed' },
                  { label: t('runs.failed'), value: 'failed' },
                  { label: t('runs.pending'), value: 'pending' },
                  { label: t('activityTable.paused'), value: 'paused' },
                  { label: t('activityTable.canceled'), value: 'canceled' },
                ],
              },
              { column: 'task_name', placeholder: t('runs.searchTasks'), type: 'text' },
              {
                column: 'started_at',
                placeholder: t('runs.filterDate'),
                type: 'date',
                dateMode: 'exact',
              },
            ]"
          >
            <!-- In the filter row, so it lines up with the filters. -->
            <template #extra-filters>
              <SelectionBar
                v-if="selection.length > 0"
                :count="selection.length"
                @clear="selection = []"
                @delete="bulkDeleteOpen = true"
              />
              <Button
                v-else
                variant="destructive"
                class="ml-auto"
                :disabled="sortedPipelines.length === 0"
                @click="openClearHistory = true"
              >
                <Trash2 class="w-4 h-4" />
                {{ t('runs.clearHistory') }}
              </Button>
            </template>
          </DataTable>
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
    </template>
  </Page>

  <BulkDeleteDialog
    v-model:open="bulkDeleteOpen"
    :items="selectedItems"
    i18n-key="runs.bulkDelete"
    :notice="runningCount > 0 ? t('runs.bulkDelete.runningNotice', runningCount) : undefined"
    :remove="removeRuns"
    @deleted="onRunsDeleted"
  />

  <AlertDialog v-model:open="openClearHistory">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('runs.clearAlert.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('runs.clearAlert.description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isClearing">{{ t('runs.clearAlert.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isClearing" @click="confirmClearHistory">
          <Loader2 v-if="isClearing" class="w-4 h-4 mr-1.5 animate-spin" />
          {{ t('runs.clearAlert.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

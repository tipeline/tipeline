<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { generateIdentifier } from '@tipeline/utils';
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import { Button } from '@/components/ui/button';
import type { ColumnDef } from '@tanstack/vue-table';
import { useRouter } from 'vue-router';
import { useQuery } from '@/composables/useQuery';
import { useStreamListener } from '@/composables/useStreamListener';
import { createColumns, type Item } from '@/config/tables/HomeRecentActivity';
import { mergeRunEvents } from '@/utils/mergeRunEvents';
import { SEND } from '@/ipc-channels';
import { useConnectionStore } from '@/store/connectionStore';
import HomeFilter from '@/components/home/HomeFilter.vue';
import { useRememberedChoice } from '@/composables/useRememberedChoice';

// `filterable` adds an All / Failed / Running switch (the dashboard's Recent runs card).
const props = withDefaults(defineProps<{ limit?: number; filterable?: boolean }>(), { limit: 50 });

const router = useRouter();
const { t } = useI18n();
const connectionStore = useConnectionStore();

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
      limit: 100,
    });
    auditMap.value = new Map(
      records.filter((r) => r.pipeline_id).map((r) => [r.pipeline_id!, r])
    );
  } catch {
    // Server unreachable — degrade gracefully
  }
}

onMounted(() => {
  if (connectionStore.isRemote) loadAudit();
});

watch(
  () => connectionStore.isRemote,
  (isRemote) => { if (isRemote) loadAudit(); }
);

// Half-width on the dashboard: the colored dot already shows the status, so the badge and
// the trigger columns (server workspaces) stay on the Runs page.
const compactColumns = ['status', 'status_badge', 'trigger_type', 'trigger_source'];

const FILTERS = ['all', 'failed', 'running'] as const;
const statusFilter = useRememberedChoice('runsFilter', FILTERS, 'all');
const filterOptions = computed(() => [
  { value: 'all' as const, label: t('recentActivity.filter.all') },
  { value: 'failed' as const, label: t('recentActivity.filter.failed') },
  { value: 'running' as const, label: t('recentActivity.filter.running') },
]);
const activeFilter = computed(() => (props.filterable ? statusFilter.value : 'all'));

function viewAll() {
  router.push(activeFilter.value === 'all' ? '/activity' : { path: '/activity', query: { status: activeFilter.value } });
}

// Pin the time column to the right edge, like the other two-column dashboard cards.
const columns = computed<ColumnDef<Item>[]>(() =>
  createColumns(t, router, connectionStore.isRemote).map((col) =>
    'accessorKey' in col && col.accessorKey === 'finished_at'
      ? { ...col, meta: { class: 'w-px whitespace-nowrap text-right' } }
      : col
  )
);

const {
  data: pipelineData,
  isLoading,
  error,
} = useQuery<Item[]>(SEND.PIPELINE_LIST, {});
const { events } = useStreamListener();

// Reload audit when a new pipeline run starts or finishes so triggered_by shows immediately
watch(
  () => events.value[events.value.length - 1],
  (latest) => {
    if (!latest || !connectionStore.isRemote) return;
    if (latest.type === 'start' || latest.type === 'end' || latest.type === 'error') {
      loadAudit();
    }
  }
);

const sortedPipelines = computed<Item[]>(() => {
  const sorted = mergeRunEvents(pipelineData.value ?? [], events.value)
    .filter((p) => activeFilter.value === 'all' || p.status === activeFilter.value)
    .slice(0, props.limit);

  if (!connectionStore.isRemote || auditMap.value.size === 0) return sorted;
  return sorted.map((p) => {
    const audit = auditMap.value.get(p.identifier);
    if (!audit) return p;
    return { ...p, triggered_by_type: audit.triggered_by_type, triggered_by_name: audit.triggered_by_name };
  });
});

// A pipeline only appears above via the initial fetch or a live 'start'/'action'
// event. A detached run (e.g. a `subtask.exec(async: true)` child) has no
// TaskStreamListener wired up for its correlationId, so it never broadcasts at
// all — it would stay invisible here until the widget remounts. Polls
// unconditionally (see Activity.vue for why gating on "something already-known
// is running" isn't reliable) via a direct IPC call rather than useQuery's
// refetch(), so a background poll doesn't flash the loading state.
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function pollPipelines() {
  try {
    const fresh: Item[] =
      (await window.ipcRenderer.invoke(SEND.PIPELINE_LIST, {
        correlationId: generateIdentifier(),
        payload: {},
      })) ?? [];
    const byIdentifier = new Map((pipelineData.value ?? []).map((p) => [p.identifier, p]));
    for (const item of fresh) byIdentifier.set(item.identifier, item);
    pipelineData.value = Array.from(byIdentifier.values());
  } catch {
    // Best-effort refresh — live events remain the primary update path.
  }
}

onMounted(() => {
  pollTimer = setInterval(pollPipelines, 8000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <Card classContent="p-0" class="h-full">
    <template #title>{{ t('recentActivity.title') }}</template>
    <template #description>{{ t('recentActivity.description') }}</template>
    <template #actions>
      <HomeFilter v-if="filterable" v-model="statusFilter" :options="filterOptions" :label="t('recentActivity.title')" />
      <Button variant="outline" size="sm" @click="viewAll">
        {{ t('recentActivity.viewAll') }}
      </Button>
    </template>

    <template #content>
      <div
        v-if="isLoading"
        class="flex items-center justify-center py-8 text-muted-foreground text-sm"
      >
        {{ t('recentActivity.loading') }}
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
        :compact="true"
        :hide-header="true"
        :animated="true"
        :hidden-columns="compactColumns"
        :filters="[]"
      />
    </template>
  </Card>
</template>

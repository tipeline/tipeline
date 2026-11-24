<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  CheckCircle2,
  CircleCheckBig,
  Loader2,
  RefreshCw,
  BellOff,
  BellRing,
} from 'lucide-vue-next';
import type { SortingState } from '@tanstack/vue-table';
import Page from '@/components/Page.vue';
import DataTable from '@/components/DataTable.vue';
import SelectionBar from '@/components/SelectionBar.vue';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { useAlertsStore, type AlertItem } from '@/store/alertsStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useAlertActions } from '@/composables/useAlertActions';
import { createColumns } from '@/config/tables/AlertsList';
import { renderMarkdown } from '@/utils/appMarkdown';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

// Every alert in the workspace, for when Needs you isn't enough: open ones, dismissed ones
// that may still be happening (quietly), and resolved ones (kept 30 days). Rows can be
// dismissed or reopened one at a time or ticked and handled together.
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useAlertsStore();
const connection = useConnectionStore();
const actions = useAlertActions();

const TABS = ['open', 'dismissed', 'resolved'] as const;
type Tab = (typeof TABS)[number];
const TAB_KEY = 'alerts.tab';
function initialTab(): Tab {
  if ((TABS as readonly string[]).includes(String(route.query.tab)))
    return route.query.tab as Tab;
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return (TABS as readonly string[]).includes(String(saved))
      ? (saved as Tab)
      : 'open';
  } catch {
    return 'open';
  }
}
const tab = ref<Tab>(initialTab());
watch(tab, (value) => {
  try {
    localStorage.setItem(TAB_KEY, value);
  } catch {
    // Remembering the tab is a convenience only.
  }
  selection.value = [];
  router.replace({ query: { ...route.query, tab: value } });
});

const all = ref<AlertItem[]>([]);
const loaded = ref(false);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  try {
    all.value =
      (await invokeCore<AlertItem[]>(SEND.ALERT_LIST, {
        includeClosed: true,
      })) ?? [];
    error.value = '';
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function refresh() {
  void store.refresh();
  void load();
}
onMounted(load);
// The open list changed (a run raised or resolved one, someone dismissed one).
watch(
  () => store.items,
  () => void load()
);
// Another workspace, other alerts.
watch(
  () => connection.activeId,
  () => {
    all.value = [];
    loaded.value = false;
    selection.value = [];
    void load();
  }
);

const counts = computed(() => ({
  open: all.value.filter((a) => a.status === 'open').length,
  dismissed: all.value.filter((a) => a.status === 'dismissed').length,
  resolved: all.value.filter((a) => a.status === 'resolved').length,
}));
const rows = computed(() => all.value.filter((a) => a.status === tab.value));

// ?workflow=<identifier> (from a workflow's Overview) opens the list on that workflow.
const workflowFilter =
  typeof route.query.workflow === 'string' ? route.query.workflow : null;
const initialFilters = workflowFilter
  ? [{ id: 'workflow', value: workflowFilter }]
  : [];
// Two workflows can share a name (a copy, the same hub workflow installed twice): their
// alerts then add the start of the identifier, so the rows and the filter tell them apart.
const workflowLabels = computed(() => {
  const names = new Map<string, string>();
  for (const a of all.value)
    names.set(a.taskIdentifier, a.workflowName ?? a.taskIdentifier);
  const uses = new Map<string, number>();
  for (const name of names.values()) uses.set(name, (uses.get(name) ?? 0) + 1);
  return new Map(
    [...names].map(([id, name]) => [
      id,
      (uses.get(name) ?? 0) > 1 ? `${name} · ${id.slice(0, 5)}` : name,
    ])
  );
});
const workflowLabel = (alert: AlertItem) =>
  workflowLabels.value.get(alert.taskIdentifier) ?? alert.taskIdentifier;
const workflowOptions = computed(() =>
  [...workflowLabels.value]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
);

// A resolved alert whose problem came back: the same workflow and key raised again after it
// closed is a new alert, which its row links to.
function cameBack(alert: AlertItem): AlertItem | null {
  if (alert.status !== 'resolved' || !alert.closedAt) return null;
  const closed = Date.parse(alert.closedAt);
  return (
    all.value.find(
      (a) =>
        a.id !== alert.id &&
        a.status !== 'resolved' &&
        a.taskIdentifier === alert.taskIdentifier &&
        a.key === alert.key &&
        Date.parse(a.firstRaisedAt) >= closed
    ) ?? null
  );
}
// The row "came back" led to, marked until another one is.
const highlighted = ref<string | null>(null);
function show(alert: AlertItem) {
  tab.value = alert.status as Tab;
  highlighted.value = alert.id;
}
const filters = computed(() => [
  {
    column: 'level',
    type: 'select' as const,
    placeholder: t('alerts.page.level'),
    allLabel: t('alerts.page.allLevels'),
    options: (['critical', 'warning', 'info'] as const).map((level) => ({
      value: level,
      label: t(`alerts.level.${level}`),
    })),
  },
  {
    column: 'workflow',
    type: 'select' as const,
    placeholder: t('alerts.page.workflow'),
    allLabel: t('alerts.page.allWorkflows'),
    options: workflowOptions.value,
  },
  {
    column: 'title',
    type: 'text' as const,
    placeholder: t('alerts.page.search'),
  },
]);
const sorting = ref<SortingState>([{ id: 'lastRaisedAt', desc: true }]);

const busy = ref<string | null>(null);
async function run(id: string | null, work: () => Promise<void>) {
  busy.value = id;
  try {
    await work();
    await load();
  } catch (e: any) {
    toast.error(e?.message ?? String(e));
  } finally {
    busy.value = null;
  }
}

const columns = computed(() =>
  createColumns(t, {
    openRun: (alert) =>
      router.push({
        name: 'PipelineDetail',
        params: {
          tid: alert.taskIdentifier,
          pipelineId: alert.pipelineIdentifier!,
        },
      }),
    openWorkflow: (alert) => router.push(`/tasks/${alert.taskIdentifier}`),
    dismiss: (alert) =>
      run(alert.id, () => actions.dismiss(alert, () => void load())),
    reopen: (alert) => run(alert.id, () => actions.reopen(alert)),
    resolve: (alert) => run(alert.id, () => actions.resolve(alert)),
    busy: () => busy.value,
    workflowLabel,
    cameBack,
    show,
  })
);
const hiddenColumns = computed(() =>
  tab.value === 'open' ? ['level', 'workflow', 'closed'] : ['level', 'workflow']
);

// Ticked rows: Dismiss (Open) or Reopen (Dismissed), and Resolve on both; nothing on Resolved.
const selection = ref<string[]>([]);
const selected = computed(() =>
  rows.value.filter((a) => selection.value.includes(a.id))
);
function bulk(action: 'toggle' | 'resolve') {
  const targets = selected.value;
  return run(null, async () => {
    if (action === 'resolve') await actions.resolveMany(targets);
    else if (tab.value === 'open')
      await actions.dismissMany(targets, () => void load());
    else await actions.reopenMany(targets);
    selection.value = [];
  });
}

const emptyText = computed(() => t(`alerts.page.empty.${tab.value}`));
</script>

<template>
  <Page scrollable>
    <template #title>{{ t('alerts.page.title') }}</template>
    <template #menu>
      <Button variant="outline" size="sm" @click="refresh">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        {{ t('approvals.refresh') }}
      </Button>
    </template>
    <template #nav>
      <Tabs v-model="tab" class="mt-2">
        <TabsList>
          <TabsTrigger
            v-for="key in TABS"
            :key="key"
            :value="key"
            :data-testid="`alerts-tab-${key}`"
          >
            {{ t(`alerts.page.tabs.${key}`) }}
            <span
              v-if="counts[key]"
              class="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums"
            >
              {{ counts[key] }}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </template>
    <template #content>
      <div class="w-full space-y-3">
        <p class="text-sm text-muted-foreground m-0">
          {{ t(`alerts.page.description.${tab}`) }}
        </p>

        <div
          v-if="!loaded"
          class="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Loader2 class="w-4 h-4 animate-spin" />
          {{ t('runs.loading') }}
        </div>
        <p v-else-if="error" class="text-sm text-destructive m-0">
          {{ error }}
        </p>
        <div
          v-else-if="!rows.length"
          class="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"
          data-testid="alerts-empty"
        >
          <CheckCircle2
            v-if="tab === 'open'"
            class="w-4 h-4 text-emerald-500 shrink-0"
          />
          {{ emptyText }}
        </div>
        <DataTable
          v-else
          v-model:sorting="sorting"
          v-model:selection="selection"
          :columns="columns"
          :data="rows"
          :flat="true"
          :page-size="50"
          :hidden-columns="hiddenColumns"
          :filters="filters"
          :initial-filters="initialFilters"
          :selectable="tab !== 'resolved'"
          :row-key="(row: AlertItem) => row.id"
          :is-row-selected="(row: AlertItem) => row.id === highlighted"
          sortable
          expandable
        >
          <template #extra-filters>
            <SelectionBar
              v-if="selection.length"
              :count="selection.length"
              @clear="selection = []"
            >
              <Button
                v-if="tab === 'open'"
                size="sm"
                variant="secondary"
                :disabled="busy !== null"
                data-testid="alerts-bulk-dismiss"
                @click="bulk('toggle')"
              >
                <BellOff class="w-4 h-4" /> {{ t('dashboard.needs.dismiss') }}
              </Button>
              <Button
                v-else
                size="sm"
                variant="secondary"
                :disabled="busy !== null"
                data-testid="alerts-bulk-reopen"
                @click="bulk('toggle')"
              >
                <BellRing class="w-4 h-4" /> {{ t('alerts.reopen') }}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                :disabled="busy !== null"
                :title="t('alerts.resolveHint')"
                data-testid="alerts-bulk-resolve"
                @click="bulk('resolve')"
              >
                <CircleCheckBig class="w-4 h-4" /> {{ t('alerts.resolve') }}
              </Button>
            </SelectionBar>
          </template>
          <template #expanded="{ row }">
            <div
              class="app-markdown text-sm px-2 py-1 max-w-3xl"
              v-html="renderMarkdown((row as AlertItem).message ?? '')"
            />
          </template>
        </DataTable>
      </div>
    </template>
  </Page>
</template>

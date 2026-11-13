<script setup lang="ts">
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import Page from '@/components/Page.vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@/composables/useQuery';
import Button from '@/components/ui/button/Button.vue';
import {
  Plus,
  Upload,
  Download,
  Tags,
  ChevronDown,
  Check,
  X,
  ShieldCheck,
  Table2,
  LayoutGrid,
  Rows3,
  ArrowUpDown,
} from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { createColumns, type TaskItem } from '@/config/tables/TasksList';
import type { ScheduleItem } from '@/config/tables/SchedulesList';
import WorkflowStats from '@/components/task/WorkflowStats.vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { useConnectionStore } from '@/store/connectionStore';
import { useErrorT } from '@/composables/useErrorT';
import { openNewTaskDialog } from '@/composables/useNewItemDialogs';
import BulkDeleteWorkflowsDialog from '@/components/task/BulkDeleteWorkflowsDialog.vue';
import SelectionBar from '@/components/SelectionBar.vue';
import { CAPABILITIES, type Capability } from '@tipeline/schemas';
import { CAPABILITY_ICON, capabilityKey } from '@/utils/capabilities';
import WorkflowCardGrid from '@/components/task/WorkflowCardGrid.vue';
import WorkflowCompactList from '@/components/task/WorkflowCompactList.vue';
import RecentItemsRow from '@/components/RecentItemsRow.vue';
import SegmentedSwitch from '@/components/SegmentedSwitch.vue';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const connectionStore = useConnectionStore();
const { translateError } = useErrorT();

const { data: rawResult, refetch } = useQuery<TaskItem[]>(SEND.TASK_LIST);
const { data: schedules } = useQuery<ScheduleItem[]>(SEND.SCHEDULE_LIST, {});

// Each workflow's next scheduled run: the earliest of its enabled schedules.
const nextRuns = computed(() => {
  const next = new Map<string, string>();
  for (const s of schedules.value ?? []) {
    if (!s.enabled || !s.nextRunAt) continue;
    const current = next.get(s.taskIdentifier);
    if (!current || Date.parse(s.nextRunAt) < Date.parse(current)) next.set(s.taskIdentifier, s.nextRunAt);
  }
  return next;
});

const result = computed<TaskItem[]>(() => {
  if (!rawResult.value) return [];
  return rawResult.value.map((task) => {
    const base: TaskItem = {
      ...task,
      tags: typeof task.tags === 'string' ? JSON.parse(task.tags) : (task.tags ?? []),
    };
    if (connectionStore.isRemote) {
      const ownership = connectionStore.taskOwnerships.get(task.identifier);
      base.is_owned_by_me = connectionStore.isOwner(task.identifier);
      base.owned_by_email = ownership?.user_email ?? null;
      base.owned_by_name = ownership?.user_name ?? null;
    }
    return base;
  });
});

// Lowercased so links saved before tags were lowercase (?tags=Hola) still match.
function tagsFromQuery(): string[] {
  const raw = route.query.tags;
  const tags = Array.isArray(raw) ? raw : [raw];
  return tags.filter((t): t is string => !!t).map((t) => t.toLowerCase());
}

const selectedTags = ref<string[]>(tagsFromQuery());

const allTags = computed<string[]>(() => {
  const set = new Set<string>();
  for (const task of result.value) {
    for (const tag of task.tags) set.add(tag);
  }
  return [...set].sort();
});

// The ticked workflows (any view), for bulk delete.
const selection = ref<string[]>([]);

// What each workflow can do (files, programs, servers…), for the "Can access" filter.
// Worked out by the local Core; not offered on a Server connection.
const capabilityIndex = ref<Record<string, Capability[]> | null>(null);
const selectedCapabilities = ref<Capability[]>([]);
watch(
  rawResult,
  async () => {
    if (connectionStore.isRemote) {
      capabilityIndex.value = null;
      return;
    }
    try {
      capabilityIndex.value = await invokeCore<Record<string, Capability[]>>(SEND.TASK_CAPABILITY_INDEX);
    } catch {
      capabilityIndex.value = null;
    }
  },
  { immediate: true }
);
// Only the capabilities some workflow has, in the usual order.
const presentCapabilities = computed<Capability[]>(() => {
  const present = new Set(Object.values(capabilityIndex.value ?? {}).flat());
  return CAPABILITIES.filter((capability) => present.has(capability));
});

// ---- how the list looks: view, scope and order (the view and order are remembered)
const VIEWS = ['table', 'cards', 'compact'] as const;
type View = (typeof VIEWS)[number];
const SORTS = ['name', 'lastRun', 'opened'] as const;
type Sort = (typeof SORTS)[number];
const SCOPES = ['all', 'failing', 'scheduled', 'starred', 'recent'] as const;
type Scope = (typeof SCOPES)[number];

const view = useRememberedChoice<View>('view', VIEWS, 'table', 'workflows');
const sort = useRememberedChoice<Sort>('sort', SORTS, 'name', 'workflows');
// Home's "All failing" link opens the list on Failing (?scope=failing).
const scopeFromQuery = (): Scope =>
  (SCOPES as readonly string[]).includes(String(route.query.scope)) ? (route.query.scope as Scope) : 'all';
const scope = ref<Scope>(scopeFromQuery());
watch(() => route.query.scope, () => (scope.value = scopeFromQuery()));
const search = ref('');
const source = ref<'all' | 'local' | 'hub'>('all');

const viewOptions = computed(() => [
  { value: 'table' as const, label: t('listViews.views.table'), icon: Table2 },
  { value: 'cards' as const, label: t('listViews.views.cards'), icon: LayoutGrid },
  { value: 'compact' as const, label: t('listViews.views.compact'), icon: Rows3 },
]);

const recentItemsStore = useRecentItemsStore();
const starredStore = useStarredItemsStore();

// Recently opened workflows that still exist, newest first, with their current name and picture.
// The store is there from the first frame, so until the list loads show it as saved: the row is
// in place right away instead of pushing the list down when it arrives.
const recentWorkflows = computed(() => {
  if (!rawResult.value) return recentItemsStore.recent('task', Infinity);
  const byIdentifier = new Map(result.value.map((task) => [task.identifier, task]));
  return recentItemsStore.recent('task', Infinity).flatMap((item) => {
    const task = byIdentifier.get(item.identifier);
    return task ? [{ ...item, name: task.name, image: task.image ?? item.image }] : [];
  });
});
const openedAt = computed(() => new Map(recentWorkflows.value.map((item) => [item.identifier, item.openedAt])));
const starredCount = computed(
  () => result.value.filter((task) => starredStore.isStarred('task', task.identifier)).length
);

const failingCount = computed(() => result.value.filter((task) => task.last_run_status === 'failed').length);
const scheduledCount = computed(() => result.value.filter((task) => nextRuns.value.has(task.identifier)).length);

const scopeOptions = computed(() => [
  { value: 'all' as const, label: t('listViews.scope.all'), count: result.value.length },
  { value: 'failing' as const, label: t('listViews.scope.failing'), count: failingCount.value },
  { value: 'scheduled' as const, label: t('listViews.scope.scheduled'), count: scheduledCount.value },
  { value: 'starred' as const, label: t('listViews.scope.starred'), count: starredCount.value },
  { value: 'recent' as const, label: t('listViews.scope.recent'), count: recentWorkflows.value.length },
]);

const filtersActive = computed(
  () =>
    search.value.trim() !== '' ||
    source.value !== 'all' ||
    selectedTags.value.length > 0 ||
    selectedCapabilities.value.length > 0
);

const filteredResult = computed<TaskItem[]>(() => {
  const query = search.value.trim().toLowerCase();
  const inScope =
    scope.value === 'starred'
      ? result.value.filter((task) => starredStore.isStarred('task', task.identifier))
      : scope.value === 'recent'
        ? result.value.filter((task) => openedAt.value.has(task.identifier))
        : scope.value === 'failing'
          ? result.value.filter((task) => task.last_run_status === 'failed')
          : scope.value === 'scheduled'
            ? result.value.filter((task) => nextRuns.value.has(task.identifier))
            : result.value;
  return inScope.filter(
    (task) =>
      (!query || task.name.toLowerCase().includes(query)) &&
      (source.value === 'all' || task.source_type === source.value) &&
      selectedTags.value.every((tag) => task.tags.includes(tag)) &&
      selectedCapabilities.value.every((capability) =>
        capabilityIndex.value?.[task.identifier]?.includes(capability)
      )
  );
});

// The Recently opened scope always lists by when it was opened; the other scopes use the sort.
const effectiveSort = computed<Sort>(() => (scope.value === 'recent' ? 'opened' : sort.value));
const shownResult = computed<TaskItem[]>(() => {
  const list = [...filteredResult.value];
  const byName = (a: TaskItem, b: TaskItem) => a.name.localeCompare(b.name);
  if (effectiveSort.value === 'name') return list.sort(byName);
  if (effectiveSort.value === 'lastRun') {
    const ran = (task: TaskItem) => (task.last_run_at ? new Date(task.last_run_at).getTime() : 0);
    return list.sort((a, b) => ran(b) - ran(a) || byName(a, b));
  }
  // Opened ones first (newest first), then the rest by name.
  const opened = (task: TaskItem) => {
    const at = openedAt.value.get(task.identifier);
    return at ? new Date(at).getTime() : 0;
  };
  return list.sort((a, b) => opened(b) - opened(a) || byName(a, b));
});

// The row above the list: only on the plain list, so it doesn't push filtered results down.
const showRecentRow = computed(
  () => scope.value === 'all' && !filtersActive.value && recentWorkflows.value.length > 0
);

// Ticked workflows that are filtered out drop out (the table does this itself), so a bulk
// delete never reaches one that isn't on screen.
watch(filteredResult, (shown) => {
  if (selection.value.length === 0) return;
  const keys = new Set(shown.map((task) => task.identifier));
  const kept = selection.value.filter((key) => keys.has(key));
  if (kept.length !== selection.value.length) selection.value = kept;
});

const emptyText = computed(() => {
  if (result.value.length === 0) return t('tasks.empty.none');
  if (filtersActive.value) return t('tasks.empty.noMatch');
  if (scope.value === 'starred') return t('tasks.empty.starred');
  if (scope.value === 'recent') return t('tasks.empty.recent');
  if (scope.value === 'failing') return t('tasks.empty.failing');
  if (scope.value === 'scheduled') return t('tasks.empty.scheduled');
  return t('tasks.empty.noMatch');
});

const columns = computed<ColumnDef<TaskItem>[]>(() =>
  createColumns(t, router, refetch, refetch, connectionStore.isRemote, {
    nextRunAt: (identifier) => nextRuns.value.get(identifier) ?? null,
  })
);
const selectedItems = computed(() =>
  result.value.filter((task) => selection.value.includes(task.identifier))
);
const bulkDeleteOpen = ref(false);

const isInstalling = ref(false);
const isExporting = ref(false);

function onNewTask() {
  openNewTaskDialog();
}

async function onInstallTask() {
  const filePath = await window.ipcRenderer.invoke('dialog:open-file');
  if (!filePath) return;
  isInstalling.value = true;
  try {
    await invokeCore(SEND.TASK_INSTALL, filePath);
    await refetch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('tasks.installFailed'), { description: translateError(msg) });
  } finally {
    isInstalling.value = false;
  }
}

async function onExportAll() {
  const dialogResult = await window.ipcRenderer.invoke('dialog:save-file', {
    defaultPath: `tipeline-tasks-export-${Date.now()}.zip`,
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  });
  if (!dialogResult?.success) return;
  isExporting.value = true;
  try {
    await invokeCore(SEND.TASK_EXPORT_ALL, dialogResult.filePath);
    toast.success(t('tasks.exportAllSuccess'), {
      action: {
        label: t('common.showInFolder'),
        onClick: () => window.ipcRenderer.invoke('shell:show-item-in-folder', dialogResult.filePath),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('tasks.exportFailed'), { description: translateError(msg) });
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <Page>
    <template #title>{{ t('tasks.title') }}</template>
    <template #menu>
      <Button variant="outline" :disabled="isInstalling" @click="onInstallTask">
        <Upload class="w-4 h-4" />
        {{ isInstalling ? t('common.installing') : t('tasks.install') }}
      </Button>
      <Button variant="outline" :disabled="isExporting" @click="onExportAll">
        <Download class="w-4 h-4" />
        {{ isExporting ? t('common.exporting') : t('tasks.exportAll') }}
      </Button>
      <Button @click="onNewTask">
        <Plus class="w-4 h-4" /> {{ t('tasks.new') }}
      </Button>
    </template>
    <template #content>
      <WorkflowStats />
      <RecentItemsRow
        v-if="showRecentRow"
        type="task"
        :items="recentWorkflows.slice(0, 12)"
        @see-all="scope = 'recent'"
        @clear="recentItemsStore.clear('task')"
      />
      <Card classContent="p-0 flex flex-col min-h-0" class="flex-1 min-h-0">
        <template #content>
          <!-- One row: scope, search and filters on the left; selection, sort and view on the right. -->
          <div class="flex flex-wrap items-center gap-2 pt-3 pb-3 mb-2 shrink-0">
            <SegmentedSwitch v-model="scope" :options="scopeOptions" :label="t('listViews.scope.label')" />
            <Input v-model="search" class="w-56 bg-card" :placeholder="t('tasks.searchPlaceholder')" />
            <Select v-model="source">
              <SelectTrigger class="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{{ t('tasks.allSources') }}</SelectItem>
                <SelectItem value="local">{{ t('tasks.local') }}</SelectItem>
                <SelectItem value="hub">{{ t('tasks.hub') }}</SelectItem>
              </SelectContent>
            </Select>
            <Popover v-if="allTags.length > 0">
              <PopoverTrigger as-child>
                <button
                  class="inline-flex h-9 w-fit items-center gap-1.5 rounded-sm border border-input bg-card px-3 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
                  :class="selectedTags.length > 0 ? 'border-primary text-primary' : ''"
                >
                  <Tags class="size-3.5 shrink-0" />
                  {{ selectedTags.length === 0 ? t('tasks.tags') : `${selectedTags.length} ${t('tasks.tags').toLowerCase()}` }}
                  <X
                    v-if="selectedTags.length > 0"
                    class="size-3 ml-0.5 opacity-60 hover:opacity-100"
                    @click.stop="selectedTags = []"
                  />
                  <ChevronDown v-else class="size-3.5 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent class="w-48 p-0" align="start">
                <Command :multiple="true" :model-value="selectedTags" @update:model-value="selectedTags = ($event as string[])">
                  <CommandInput :placeholder="t('tasks.searchTags')" />
                  <CommandList>
                    <CommandEmpty>{{ t('tasks.noTags') }}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        v-for="tag in allTags"
                        :key="tag"
                        :value="tag"
                      >
                        <Check
                          class="w-4 h-4 shrink-0 transition-opacity"
                          :class="selectedTags.includes(tag) ? 'opacity-100' : 'opacity-0'"
                        />
                        {{ tag }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Popover v-if="presentCapabilities.length > 0">
              <PopoverTrigger as-child>
                <button
                  class="inline-flex h-9 w-fit items-center gap-1.5 rounded-sm border border-input bg-card px-3 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
                  :class="selectedCapabilities.length > 0 ? 'border-primary text-primary' : ''"
                >
                  <ShieldCheck class="size-3.5 shrink-0" />
                  {{
                    selectedCapabilities.length === 1
                      ? t(`capabilities.label.${capabilityKey(selectedCapabilities[0])}`)
                      : selectedCapabilities.length > 1
                        ? t('capabilities.filterCount', { count: selectedCapabilities.length })
                        : t('capabilities.canAccess')
                  }}
                  <X
                    v-if="selectedCapabilities.length > 0"
                    class="size-3 ml-0.5 opacity-60 hover:opacity-100"
                    @click.stop="selectedCapabilities = []"
                  />
                  <ChevronDown v-else class="size-3.5 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent class="w-60 p-0" align="start">
                <Command
                  :multiple="true"
                  :model-value="selectedCapabilities"
                  @update:model-value="selectedCapabilities = ($event as Capability[])"
                >
                  <CommandList>
                    <CommandGroup>
                      <CommandItem v-for="capability in presentCapabilities" :key="capability" :value="capability">
                        <Check
                          class="w-4 h-4 shrink-0 transition-opacity"
                          :class="selectedCapabilities.includes(capability) ? 'opacity-100' : 'opacity-0'"
                        />
                        <component :is="CAPABILITY_ICON[capability]" class="size-3.5 text-muted-foreground" />
                        {{ t(`capabilities.label.${capabilityKey(capability)}`) }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div class="ml-auto flex items-center gap-2">
              <SelectionBar
                v-if="selection.length > 0"
                :count="selection.length"
                @clear="selection = []"
                @delete="bulkDeleteOpen = true"
              />
              <Select v-if="scope !== 'recent'" v-model="sort">
                <SelectTrigger class="bg-card" :aria-label="t('listViews.sort.label')">
                  <ArrowUpDown class="size-3.5 opacity-60" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="option in SORTS" :key="option" :value="option">
                    {{ t(`listViews.sort.${option}`) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <SegmentedSwitch v-model="view" :options="viewOptions" :label="t('listViews.views.label')" />
            </div>
          </div>

          <div v-if="rawResult && shownResult.length === 0" class="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            {{ emptyText }}
          </div>
          <DataTable
            v-else-if="view === 'table'"
            :columns="columns"
            :data="shownResult"
            :flat="true"
            :filters="[]"
            selectable
            :row-key="(task: TaskItem) => task.identifier"
            v-model:selection="selection"
          />
          <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-fade pb-2">
            <WorkflowCardGrid
              v-if="view === 'cards'"
              v-model:selection="selection"
              :items="shownResult"
              :opened-at="scope === 'recent' ? openedAt : undefined"
              @deleted="refetch()"
              @updated="refetch()"
            />
            <WorkflowCompactList
              v-else
              v-model:selection="selection"
              :items="shownResult"
              :opened-at="scope === 'recent' ? openedAt : undefined"
              @deleted="refetch()"
              @updated="refetch()"
            />
          </div>
        </template>
      </Card>
      <BulkDeleteWorkflowsDialog
        v-model:open="bulkDeleteOpen"
        :items="selectedItems"
        @deleted="refetch()"
      />
    </template>
  </Page>
</template>

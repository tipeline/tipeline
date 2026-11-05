<script setup lang="ts">
import DataTable from '@/components/DataTable.vue';
import Card from '@/components/Card.vue';
import Page from '@/components/Page.vue';
import type { ColumnDef } from '@tanstack/vue-table';
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@/composables/useQuery';
import Button from '@/components/ui/button/Button.vue';
import { Plus, Upload, Download, Table2, LayoutGrid, Rows3, ArrowUpDown } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createColumns, type AppItem } from '@/config/tables/AppsList';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { openNewAppDialog } from '@/composables/useNewItemDialogs';
import { useAppExport } from '@/composables/useAppExport';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import SelectionBar from '@/components/SelectionBar.vue';
import SegmentedSwitch from '@/components/SegmentedSwitch.vue';
import RecentItemsRow from '@/components/RecentItemsRow.vue';
import AppCardGrid from '@/components/app/AppCardGrid.vue';
import AppCompactList from '@/components/app/AppCompactList.vue';
import BulkDeleteDialog from '@/components/BulkDeleteDialog.vue';
import { deleteEach, type BulkDeleteItem } from '@/utils/bulkDelete';
import { deleteApp } from '@/utils/deleteApp';
import { useRecentItemsStore } from '@/store/recentItems';
import { useStarredItemsStore } from '@/store/starredItems';

const router = useRouter();
const { t } = useI18n();
const { translateError } = useErrorT();
const { data: result, refetch } = useQuery<AppItem[]>(SEND.APP_LIST);
const columns = computed<ColumnDef<AppItem>[]>(() => createColumns(t, router, refetch, refetch));
const isInstalling = ref(false);
const { isExporting, exportApps } = useAppExport();

// The list comes newest first; keep that order to sort by "Newest".
const apps = computed<AppItem[]>(() => result.value ?? []);

// ---- how the list looks: view, scope and order (the view and order are remembered)
const VIEWS = ['table', 'cards', 'compact'] as const;
type View = (typeof VIEWS)[number];
const SORTS = ['name', 'newest', 'opened'] as const;
type Sort = (typeof SORTS)[number];
type Scope = 'all' | 'starred' | 'recent';

const view = useRememberedChoice<View>('view', VIEWS, 'table', 'apps');
const sort = useRememberedChoice<Sort>('sort', SORTS, 'name', 'apps');
const scope = ref<Scope>('all');
const search = ref('');
const source = ref<'all' | 'local' | 'hub'>('all');

const viewOptions = computed(() => [
  { value: 'table' as const, label: t('listViews.views.table'), icon: Table2 },
  { value: 'cards' as const, label: t('listViews.views.cards'), icon: LayoutGrid },
  { value: 'compact' as const, label: t('listViews.views.compact'), icon: Rows3 },
]);

const recentItemsStore = useRecentItemsStore();
const starredStore = useStarredItemsStore();

// Recently opened apps that still exist, newest first, with their current name and picture.
// Until the list loads, show the store as saved so the row is in place from the first frame.
const recentApps = computed(() => {
  if (!result.value) return recentItemsStore.recent('app', Infinity);
  const byIdentifier = new Map(apps.value.map((app) => [app.identifier, app]));
  return recentItemsStore.recent('app', Infinity).flatMap((item) => {
    const app = byIdentifier.get(item.identifier);
    return app ? [{ ...item, name: app.name, image: app.image ?? item.image }] : [];
  });
});
const openedAt = computed(() => new Map(recentApps.value.map((item) => [item.identifier, item.openedAt])));
const starredCount = computed(() => apps.value.filter((app) => starredStore.isStarred('app', app.identifier)).length);

const scopeOptions = computed(() => [
  { value: 'all' as const, label: t('listViews.scope.all'), count: apps.value.length },
  { value: 'starred' as const, label: t('listViews.scope.starred'), count: starredCount.value },
  { value: 'recent' as const, label: t('listViews.scope.recent'), count: recentApps.value.length },
]);

const filtersActive = computed(() => search.value.trim() !== '' || source.value !== 'all');

const filteredApps = computed<AppItem[]>(() => {
  const query = search.value.trim().toLowerCase();
  const inScope =
    scope.value === 'starred'
      ? apps.value.filter((app) => starredStore.isStarred('app', app.identifier))
      : scope.value === 'recent'
        ? apps.value.filter((app) => openedAt.value.has(app.identifier))
        : apps.value;
  return inScope.filter(
    (app) =>
      (!query || app.name.toLowerCase().includes(query)) &&
      (source.value === 'all' || (app.source_type ?? 'local') === source.value)
  );
});

// The Recently opened scope always lists by when it was opened; the other scopes use the sort.
const effectiveSort = computed<Sort>(() => (scope.value === 'recent' ? 'opened' : sort.value));
const shownApps = computed<AppItem[]>(() => {
  const list = [...filteredApps.value];
  const byName = (a: AppItem, b: AppItem) => a.name.localeCompare(b.name);
  if (effectiveSort.value === 'newest') return list;
  if (effectiveSort.value === 'name') return list.sort(byName);
  // Opened ones first (newest first), then the rest by name.
  const opened = (app: AppItem) => {
    const at = openedAt.value.get(app.identifier);
    return at ? new Date(at).getTime() : 0;
  };
  return list.sort((a, b) => opened(b) - opened(a) || byName(a, b));
});

// The row above the list: only on the plain list, so it doesn't push filtered results down.
const showRecentRow = computed(
  () => scope.value === 'all' && !filtersActive.value && recentApps.value.length > 0
);

const emptyText = computed(() => {
  if (apps.value.length === 0) return t('apps.empty.none');
  if (filtersActive.value) return t('apps.empty.noMatch');
  if (scope.value === 'starred') return t('apps.empty.starred');
  if (scope.value === 'recent') return t('apps.empty.recent');
  return t('apps.empty.noMatch');
});

const selection = ref<string[]>([]);
const bulkDeleteOpen = ref(false);
const selectedItems = computed<BulkDeleteItem[]>(() =>
  apps.value
    .filter((app) => selection.value.includes(app.identifier))
    .map((app) => ({ key: app.identifier, name: app.name }))
);
const removeApps = (items: BulkDeleteItem[]) => deleteEach(items, deleteApp, translateError);

// Ticked apps that are filtered out drop out (the table does this itself), so a bulk
// delete never reaches one that isn't on screen.
watch(filteredApps, (shown) => {
  if (selection.value.length === 0) return;
  const keys = new Set(shown.map((app) => app.identifier));
  const kept = selection.value.filter((key) => keys.has(key));
  if (kept.length !== selection.value.length) selection.value = kept;
});

function handleNewApp() {
  openNewAppDialog();
}

async function onInstallApp() {
  const filePath = await window.ipcRenderer.invoke('dialog:open-file');
  if (!filePath) return;
  isInstalling.value = true;
  try {
    await invokeCore(SEND.APP_INSTALL, filePath);
    await refetch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(t('apps.installFailed'), { description: translateError(msg) });
  } finally {
    isInstalling.value = false;
  }
}
</script>

<template>
  <Page>
    <template #title>{{ t('apps.title') }}</template>
    <template #menu>
      <Button variant="outline" :disabled="isInstalling" @click="onInstallApp">
        <Upload class="w-4 h-4" />
        {{ isInstalling ? t('common.installing') : t('apps.install') }}
      </Button>
      <Button
        variant="outline"
        :disabled="isExporting || !result?.length"
        @click="exportApps(`tipeline-apps-export-${Date.now()}`)"
      >
        <Download class="w-4 h-4" />
        {{ isExporting ? t('common.exporting') : t('apps.exportAll') }}
      </Button>
      <Button @click="handleNewApp">
        <Plus class="w-4 h-4" /> {{ t('apps.new') }}
      </Button>
    </template>
    <template #content>
      <RecentItemsRow
        v-if="showRecentRow"
        type="app"
        :items="recentApps.slice(0, 12)"
        @see-all="scope = 'recent'"
        @clear="recentItemsStore.clear('app')"
      />
      <Card classContent="p-0 flex flex-col min-h-0" class="flex-1 min-h-0">
        <template #content>
          <!-- One row: scope, search and filters on the left; selection, sort and view on the right. -->
          <div class="flex flex-wrap items-center gap-2 pt-3 pb-3 mb-2 shrink-0">
            <SegmentedSwitch v-model="scope" :options="scopeOptions" :label="t('listViews.scope.label')" />
            <Input v-model="search" class="w-56 bg-card" :placeholder="t('apps.searchPlaceholder')" />
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

          <div v-if="result && shownApps.length === 0" class="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            {{ emptyText }}
          </div>
          <DataTable
            v-else-if="view === 'table'"
            :columns="columns"
            :data="shownApps"
            :flat="true"
            :filters="[]"
            selectable
            :row-key="(app: AppItem) => app.identifier"
            v-model:selection="selection"
          />
          <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-fade pb-2">
            <AppCardGrid
              v-if="view === 'cards'"
              v-model:selection="selection"
              :items="shownApps"
              :opened-at="scope === 'recent' ? openedAt : undefined"
              @deleted="refetch()"
              @updated="refetch()"
            />
            <AppCompactList
              v-else
              v-model:selection="selection"
              :items="shownApps"
              :opened-at="scope === 'recent' ? openedAt : undefined"
              @deleted="refetch()"
              @updated="refetch()"
            />
          </div>
        </template>
      </Card>
      <BulkDeleteDialog
        v-model:open="bulkDeleteOpen"
        :items="selectedItems"
        i18n-key="apps.bulkDelete"
        :remove="removeApps"
        @deleted="refetch()"
      />
    </template>
  </Page>
</template>

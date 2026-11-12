<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Workflow, Folders, AppWindow } from 'lucide-vue-next';
import StarButton from '@/components/StarButton.vue';
import HomeFilter from '@/components/home/HomeFilter.vue';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { useLiveItems } from '@/composables/useLiveItems';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import { toAssetUrl } from '@/utils/assetUrl';
import { dayGroupLabel, groupByDay } from '@/utils/dayGroups';
import { ENTITY_COLORS } from '@/config/entityColors';
import { HOME_HEADING, HOME_HEADING_ROW } from '@/config/homeStyles';
import type { TaskItem } from '@/config/tables/TasksList';

// Home's Recently opened: a table in the middle column, grouped by day (Today, Yesterday,
// Earlier this week, Older): the name with its project under it, and when it was opened.
// Filtered to workflows or apps if asked; it fills the column and scrolls inside. The store
// keeps more, so deleted items don't leave the list short.
const MAX_SHOWN = 20;

const { t } = useI18n();
const router = useRouter();
const recentItemsStore = useRecentItemsStore();
const { loaded, keepLive } = useLiveItems();

const FILTERS = ['all', 'task', 'app'] as const;
const filter = useRememberedChoice('recentFilter', FILTERS, 'all');
const filterOptions = computed(() => [
  { value: 'all' as const, label: t('dashboard.starred.all') },
  { value: 'task' as const, label: t('dashboard.starred.workflows') },
  { value: 'app' as const, label: t('dashboard.starred.apps') },
]);

const items = computed(() => {
  if (!loaded.value) return [];
  const live = keepLive(recentItemsStore.recent(undefined, Infinity));
  return (filter.value === 'all' ? live : live.filter((i) => i.type === filter.value)).slice(0, MAX_SHOWN);
});

const groups = computed(() => groupByDay(items.value, (item) => new Date(item.openedAt)));

const typeIcons = { task: Workflow, project: Folders, app: AppWindow } as const;
const typeTint = {
  task: ENTITY_COLORS.workflow.tint,
  project: ENTITY_COLORS.project.tint,
  app: ENTITY_COLORS.app.tint,
} as const;

// A workflow's last run, as a dot after its name.
const statusDot: Record<NonNullable<TaskItem['last_run_status']>, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-destructive',
  running: 'bg-blue-500',
  paused: 'bg-amber-500',
  pending: 'bg-amber-500',
  canceled: 'bg-muted-foreground/50',
};
</script>

<template>
  <section class="flex flex-col gap-2 min-h-0 h-full" aria-labelledby="home-recent-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-recent-title" :class="HOME_HEADING">{{ t('dashboard.recentItems.title') }}</h2>
      <HomeFilter v-model="filter" :options="filterOptions" :label="t('dashboard.recentItems.title')" />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-fade border border-border rounded-md bg-card">
      <table v-if="items.length" class="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr class="text-xs text-muted-foreground">
            <th class="sticky top-0 z-10 bg-card text-left font-medium px-4 py-2 border-b border-border">
              {{ t('dashboard.recentItems.name') }}
            </th>
            <th class="sticky top-0 z-10 bg-card text-right font-medium px-4 py-2 border-b border-border w-px whitespace-nowrap">
              {{ t('dashboard.recentItems.opened') }}
            </th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.key">
          <tr>
            <th colspan="2" scope="colgroup" class="text-left px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {{ t(`dashboard.recentItems.groups.${group.key}`) }}
            </th>
          </tr>
          <tr v-for="item in group.rows" :key="`${item.type}:${item.identifier}`" class="group hover:bg-muted/50 transition-colors">
            <td class="px-4 py-1.5 max-w-0">
              <div class="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  class="flex items-center gap-2.5 min-w-0 text-left"
                  @click="router.push(recentItemPath(item))"
                >
                  <span
                    class="flex items-center justify-center w-7 h-7 rounded-md shrink-0 overflow-hidden"
                    :class="toAssetUrl(item.image) ? '' : typeTint[item.type]"
                  >
                    <img v-if="toAssetUrl(item.image)" :src="toAssetUrl(item.image)!" class="w-full h-full object-cover" />
                    <component :is="typeIcons[item.type]" v-else class="w-3.5 h-3.5" />
                  </span>
                  <span class="min-w-0">
                    <span class="flex items-center gap-1.5 min-w-0">
                      <p class="text-sm font-medium truncate m-0">{{ item.name }}</p>
                      <span
                        v-if="item.type === 'task' && item.lastRunStatus"
                        class="w-1.5 h-1.5 rounded-full shrink-0"
                        :class="statusDot[item.lastRunStatus]"
                        :title="t('dashboard.recentItems.lastRun', { status: t(`taskHistory.${item.lastRunStatus}`) })"
                      />
                    </span>
                    <span v-if="item.projects[0]" class="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                      <span
                        class="w-1.5 h-1.5 rounded-full shrink-0"
                        :style="{ backgroundColor: item.projects[0].color || 'var(--muted-foreground)' }"
                      />
                      <span class="truncate">{{ item.projects[0].name }}</span>
                      <span v-if="item.projects.length > 1" class="shrink-0">+{{ item.projects.length - 1 }}</span>
                    </span>
                  </span>
                </button>
                <StarButton
                  v-if="item.type !== 'project'"
                  :type="item.type"
                  :identifier="item.identifier"
                  :name="item.name"
                  :image="item.image"
                  subtle
                  class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                />
              </div>
            </td>
            <td class="px-4 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
              {{ dayGroupLabel(new Date(item.openedAt), group.key) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else-if="loaded" class="text-sm text-muted-foreground px-4 py-3 m-0">
        {{ filter === 'all' ? t('dashboard.recentItems.empty') : t('dashboard.recentItems.emptyFiltered') }}
      </p>
    </div>
  </section>
</template>

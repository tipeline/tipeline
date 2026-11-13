<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { AppWindow, Plus, Workflow } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import { useQuery } from '@/composables/useQuery';
import { useLiveItems } from '@/composables/useLiveItems';
import { useStarredItemsStore } from '@/store/starredItems';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { ENTITY_COLORS } from '@/config/entityColors';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK } from '@/config/homeStyles';
import { SEND } from '@/ipc-channels';

// Home's way back to work: starred workflows and apps first (in the order the user keeps
// them), then the ones opened lately, as one row of tiles. Each says when it last ran or was
// opened; a dot shows a workflow's last run. Two rows at most until "Show all", so Home
// stays about one screen tall however much is starred.
const SHOWN = 12;
const MIN_RECENT = 6;
const ROWS = 2;
// Matches the grid below: tiles at least 10.5rem (168px) wide, 12px apart.
const TILE_MIN = 168;
const GAP = 12;

const { t } = useI18n();
const router = useRouter();
const starred = useStarredItemsStore();
const recent = useRecentItemsStore();
const { loaded, keepLive } = useLiveItems();

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

const tiles = computed(() => {
  if (!loaded.value) return [];
  const openedAt = new Map(recent.items.map((i) => [`${i.type}:${i.identifier}`, i.openedAt]));
  const stars = keepLive(starred.items).map((item) => ({
    ...item,
    openedAt: openedAt.get(`${item.type}:${item.identifier}`) ?? null,
    star: true,
  }));
  const seen = new Set(stars.map((i) => `${i.type}:${i.identifier}`));
  const opened = keepLive(
    recent.recent(undefined, Infinity).filter((i): i is typeof i & { type: 'task' | 'app' } => i.type !== 'project')
  )
    .filter((i) => !seen.has(`${i.type}:${i.identifier}`))
    .map((item) => ({ ...item, star: false }));
  // Every star, then enough recent ones to fill a row.
  const room = Math.max(MIN_RECENT, SHOWN - stars.length);
  return [...stars, ...opened.slice(0, room)].map((item) => ({
    ...item,
    meta:
      item.type === 'task' && item.lastRunAt
        ? t('dashboard.continue.ran', { time: ago(item.lastRunAt) })
        : item.openedAt
          ? t('dashboard.continue.opened', { time: ago(item.openedAt) })
          : item.type === 'task'
            ? t('dashboard.continue.neverRan')
            : undefined,
  }));
});

const grid = ref<HTMLElement | null>(null);
const { width } = useElementSize(grid);
const columns = computed(() => (width.value ? Math.max(1, Math.floor((width.value + GAP) / (TILE_MIN + GAP))) : 6));
const showAll = ref(false);
// Show less puts the page back where it was before Show all: otherwise it stays scrolled
// down, and the top edge fades over the greeting.
let scrollBefore = 0;
const scroller = () => grid.value?.closest<HTMLElement>('.overflow-y-auto') ?? null;
async function toggleAll() {
  if (!showAll.value) {
    scrollBefore = scroller()?.scrollTop ?? 0;
    showAll.value = true;
    return;
  }
  showAll.value = false;
  await nextTick();
  const el = scroller();
  if (el) el.scrollTop = scrollBefore;
}
const limit = computed(() => columns.value * ROWS);
const hidden = computed(() => Math.max(0, tiles.value.length - limit.value));
const shown = computed(() => (showAll.value || !hidden.value ? tiles.value : tiles.value.slice(0, limit.value)));

// Star something new without leaving Home: pick a workflow or app that isn't starred yet.
type Pickable = { identifier: string; name: string; image?: string | null };
const { data: workflows } = useQuery<Pickable[]>(SEND.TASK_LIST, {});
const { data: apps } = useQuery<Pickable[]>(SEND.APP_LIST);
const addOpen = ref(false);
const pickable = computed(() => {
  const sorted = (list: Pickable[] | null | undefined, type: 'task' | 'app') =>
    (list ?? [])
      .filter((i) => !starred.isStarred(type, i.identifier))
      .map((i) => ({ ...i, type }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return [
    { type: 'task' as const, label: t('dashboard.starred.workflows'), items: sorted(workflows.value, 'task') },
    { type: 'app' as const, label: t('dashboard.starred.apps'), items: sorted(apps.value, 'app') },
  ].filter((g) => g.items.length);
});
function add(item: Pickable & { type: 'task' | 'app' }) {
  starred.star(item.type, item.identifier, item.name, item.image);
  addOpen.value = false;
}
const pickIcons = { task: Workflow, app: AppWindow } as const;
const pickTint = { task: ENTITY_COLORS.workflow.tint, app: ENTITY_COLORS.app.tint } as const;
</script>

<template>
  <section class="flex flex-col gap-2" aria-labelledby="home-continue-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-continue-title" :class="HOME_HEADING">
        {{ t('dashboard.continue.title') }}
        <span class="text-xs font-normal text-muted-foreground">{{ t('dashboard.continue.hint') }}</span>
      </h2>
      <Popover v-if="loaded" v-model:open="addOpen">
        <PopoverTrigger as-child>
          <button type="button" :class="[HOME_LINK, 'inline-flex items-center gap-1']">
            <Plus class="w-3.5 h-3.5" />
            {{ t('dashboard.starred.add') }}
          </button>
        </PopoverTrigger>
        <PopoverContent class="w-72 p-0" align="end">
          <Command>
            <CommandInput :placeholder="t('dashboard.starred.search')" />
            <CommandList>
              <CommandEmpty>{{ t('dashboard.starred.nothingToAdd') }}</CommandEmpty>
              <CommandGroup v-for="group in pickable" :key="group.type" :heading="group.label">
                <CommandItem
                  v-for="item in group.items"
                  :key="`${item.type}:${item.identifier}`"
                  :value="`${item.name} ${item.type}:${item.identifier}`"
                  @select="add(item)"
                >
                  <span class="flex items-center justify-center w-5 h-5 rounded shrink-0" :class="pickTint[item.type]">
                    <component :is="pickIcons[item.type]" class="w-3 h-3" />
                  </span>
                  <span class="truncate">{{ item.name }}</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>

    <p v-if="loaded && !tiles.length" class="text-sm text-muted-foreground m-0">
      {{ t('dashboard.continue.empty') }}
    </p>
    <div v-else ref="grid" class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
      <HomeItemTile
        v-for="item in shown"
        :key="`${item.type}:${item.identifier}`"
        :type="item.type"
        :identifier="item.identifier"
        :name="item.name"
        :image="item.image"
        :projects="item.projects"
        :subtitle="item.type === 'app' ? t('dashboard.starred.app') : t('dashboard.starred.workflow')"
        :meta="item.meta"
        :status="item.type === 'task' ? item.lastRunStatus : undefined"
        starrable
        @open="router.push(recentItemPath(item))"
      />
    </div>
    <button
      v-if="hidden || showAll"
      type="button"
      :class="[HOME_LINK, 'self-start']"
      :aria-expanded="showAll"
      @click="toggleAll"
    >
      {{ showAll ? t('dashboard.continue.showLess') : t('dashboard.continue.showAll', { n: tiles.length }) }}
    </button>
  </section>
</template>

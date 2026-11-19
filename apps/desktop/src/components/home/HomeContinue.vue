<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { AppWindow, Plus, Workflow } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import HomeTileGroup from '@/components/home/HomeTileGroup.vue';
import { useQuery } from '@/composables/useQuery';
import { useLiveItems } from '@/composables/useLiveItems';
import { useStarredItemsStore } from '@/store/starredItems';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { ENTITY_COLORS } from '@/config/entityColors';
import { HOME_HEADING, HOME_HEADING_ROW, HOME_LINK } from '@/config/homeStyles';
import { SEND } from '@/ipc-channels';
import type { ProjectTag } from '@/utils/projectAssign';

// Home's way back to work, in two rows so neither hides the other: starred workflows and
// apps (in the order the user keeps them), then the ones opened lately that aren't starred.
// Each row shows what fits on one line, the rest behind its own "Show all". Each tile says
// when it last ran or was opened; a dot shows a workflow's last run.
const MAX_RECENT = 12;

const { t } = useI18n();
const router = useRouter();
const starred = useStarredItemsStore();
const recent = useRecentItemsStore();
const { loaded, keepLive } = useLiveItems();

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

type Tile = {
  type: 'task' | 'app';
  identifier: string;
  name: string;
  image?: string | null;
  projects?: ProjectTag[];
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  openedAt: string | null;
};

function withMeta(item: Tile) {
  return {
    ...item,
    meta:
      item.type === 'task' && item.lastRunAt
        ? t('dashboard.continue.ran', { time: ago(item.lastRunAt) })
        : item.openedAt
          ? t('dashboard.continue.opened', { time: ago(item.openedAt) })
          : item.type === 'task'
            ? t('dashboard.continue.neverRan')
            : undefined,
  };
}

const starTiles = computed(() => {
  if (!loaded.value) return [];
  const openedAt = new Map(recent.items.map((i) => [`${i.type}:${i.identifier}`, i.openedAt]));
  return keepLive(starred.items).map((item) =>
    withMeta({ ...item, openedAt: openedAt.get(`${item.type}:${item.identifier}`) ?? null })
  );
});

const recentTiles = computed(() => {
  if (!loaded.value) return [];
  const seen = new Set(starTiles.value.map((i) => `${i.type}:${i.identifier}`));
  return keepLive(
    recent.recent(undefined, Infinity).filter((i): i is typeof i & { type: 'task' | 'app' } => i.type !== 'project')
  )
    .filter((i) => !seen.has(`${i.type}:${i.identifier}`))
    .slice(0, MAX_RECENT)
    .map(withMeta);
});

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
const groups = computed(() => [
  { key: 'starred', label: t('dashboard.continue.starred'), items: starTiles.value },
  { key: 'recent', label: t('dashboard.continue.recent'), items: recentTiles.value },
]);

const pickIcons = { task: Workflow, app: AppWindow } as const;
const pickTint = { task: ENTITY_COLORS.workflow.tint, app: ENTITY_COLORS.app.tint } as const;
</script>

<template>
  <section class="flex flex-col gap-2" aria-labelledby="home-continue-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-continue-title" :class="HOME_HEADING">
        {{ t('dashboard.continue.title') }}
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

    <p v-if="loaded && !starTiles.length && !recentTiles.length" class="text-sm text-muted-foreground m-0">
      {{ t('dashboard.continue.empty') }}
    </p>
    <div v-else class="flex flex-col gap-5">
      <template v-for="group in groups" :key="group.key">
        <HomeTileGroup v-if="group.items.length" :label="group.label" :items="group.items">
          <template #default="{ item }">
            <HomeItemTile
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
          </template>
        </HomeTileGroup>
      </template>
    </div>
  </section>
</template>

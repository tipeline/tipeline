<script setup lang="ts">
import { computed, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AppWindow, Plus, Star, Workflow } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import { ENTITY_COLORS } from '@/config/entityColors';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import HomeFilter from '@/components/home/HomeFilter.vue';
import { useStarredItemsStore, type StarredItem } from '@/store/starredItems';
import { recentItemPath } from '@/store/recentItems';
import { useLiveItems } from '@/composables/useLiveItems';
import { useRememberedChoice } from '@/composables/useRememberedChoice';
import { HOME_HEADING, HOME_HEADING_ROW } from '@/config/homeStyles';

const { t } = useI18n();
const router = useRouter();
const starred = useStarredItemsStore();
const { loaded, keepLive } = useLiveItems();

const FILTERS = ['all', 'app', 'task'] as const;
const filter = useRememberedChoice('starredFilter', FILTERS, 'all');
const filterOptions = computed(() => [
  { value: 'all' as const, label: t('dashboard.starred.all') },
  { value: 'app' as const, label: t('dashboard.starred.apps') },
  { value: 'task' as const, label: t('dashboard.starred.workflows') },
]);

const all = computed(() => (loaded.value ? keepLive(starred.items) : []));
// Filtering only means something once both kinds are starred.
const showFilter = computed(() => new Set(all.value.map((i) => i.type)).size > 1);
const filtered = computed(() =>
  !showFilter.value || filter.value === 'all' ? all.value : all.value.filter((i) => i.type === filter.value)
);

// Tiles, as many to a row as fit (about 140px each): 2 in the usual third, up to 4 when wide.
const grid = ref<HTMLElement | null>(null);
const { width } = useElementSize(grid);
const columns = computed(() => (width.value === 0 ? 3 : Math.max(2, Math.min(4, Math.floor(width.value / 140)))));

// The tile at the end: pick a workflow or app that isn't starred yet, searched by name.
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

// Drag a tile onto another to reorder. The order is saved across the full list, so it
// holds when switching filters.
const key = (item: { type: string; identifier: string }) => `${item.type}:${item.identifier}`;
const dragging = ref<StarredItem | null>(null);
const dropTarget = ref<string | null>(null);

function onDragStart(event: DragEvent, item: StarredItem) {
  dragging.value = item;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key(item));
  }
}

function onDragOver(item: StarredItem) {
  if (dragging.value) dropTarget.value = key(item);
}

function onDrop(item: StarredItem) {
  if (dragging.value) starred.move(dragging.value, item);
  onDragEnd();
}

function onDragEnd() {
  dragging.value = null;
  dropTarget.value = null;
}
</script>

<template>
  <!-- Home's Starred, above Projects: a tile per star (icon, name, project), all of them,
       scrolling inside its half of the column. -->
  <section class="flex flex-col gap-2 min-h-0" aria-labelledby="home-starred-title">
    <div :class="HOME_HEADING_ROW">
      <h2 id="home-starred-title" :class="HOME_HEADING">
        <Star class="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        {{ t('dashboard.starred.title') }}
      </h2>
      <HomeFilter v-if="showFilter" v-model="filter" :options="filterOptions" :label="t('dashboard.starred.title')" />
    </div>

    <p v-if="loaded && !all.length" class="text-xs text-muted-foreground m-0">
      {{ t('dashboard.starred.empty') }}
    </p>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-fade">
      <div
        ref="grid"
        class="grid gap-3 content-start"
        :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
      >
        <HomeItemTile
          v-for="item in filtered"
          :key="key(item)"
          :type="item.type"
          :identifier="item.identifier"
          :name="item.name"
          :image="item.image"
          :projects="item.projects"
          :subtitle="item.type === 'app' ? t('dashboard.starred.app') : t('dashboard.starred.workflow')"
          starrable
          draggable="true"
          class="rounded-md"
          :class="[
            dragging && key(dragging) === key(item) ? 'opacity-50' : '',
            dropTarget === key(item) && dragging && key(dragging) !== key(item) ? 'ring-2 ring-primary' : '',
          ]"
          @dragstart="onDragStart($event, item)"
          @dragover.prevent="onDragOver(item)"
          @drop.prevent="onDrop(item)"
          @dragend="onDragEnd"
          @open="router.push(recentItemPath(item))"
        />

        <Popover v-if="loaded" v-model:open="addOpen">
          <PopoverTrigger as-child>
            <button
              type="button"
              class="flex flex-col gap-2.5 w-full p-3 border border-dashed border-border rounded-md text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <span class="flex items-center justify-center w-8 h-8 rounded-md border border-dashed border-muted-foreground/40 shrink-0">
                <Plus class="w-4 h-4" />
              </span>
              <span class="font-medium leading-snug">{{ t('dashboard.starred.add') }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent class="w-72 p-0" align="start">
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
    </div>
  </section>
</template>

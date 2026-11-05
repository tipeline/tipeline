<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useElementSize } from '@vueuse/core';
import { useRouter } from 'vue-router';
import { Star } from 'lucide-vue-next';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import HomeFilter from '@/components/home/HomeFilter.vue';
import { Button } from '@/components/ui/button';
import { useStarredItemsStore, type StarredItem } from '@/store/starredItems';
import { recentItemPath } from '@/store/recentItems';
import { useLiveItems } from '@/composables/useLiveItems';
import { useRememberedChoice } from '@/composables/useRememberedChoice';

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

// One row of tiles (they are at least 10rem wide) unless the user asks for all of them.
const TILE_MIN_PX = 160;
const GAP_PX = 10;
const FALLBACK_COLUMNS = 6;
const grid = ref<HTMLElement | null>(null);
const { width } = useElementSize(grid);
const columns = computed(() =>
  width.value > 0 ? Math.max(1, Math.floor((width.value + GAP_PX) / (TILE_MIN_PX + GAP_PX))) : FALLBACK_COLUMNS
);
const expanded = ref(false);
const hiddenCount = computed(() => Math.max(0, filtered.value.length - columns.value));
const visible = computed(() => (expanded.value ? filtered.value : filtered.value.slice(0, columns.value)));

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
  <section class="space-y-2">
    <div class="flex items-center justify-between gap-2 min-h-6">
      <h3 class="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Star class="w-3.5 h-3.5" />
        {{ t('dashboard.starred.title') }}
      </h3>
      <div class="flex items-center gap-2">
        <HomeFilter v-if="showFilter" v-model="filter" :options="filterOptions" :label="t('dashboard.starred.title')" />
        <Button
          v-if="hiddenCount > 0 || expanded"
          variant="ghost"
          size="sm"
          class="h-6 px-2 text-xs"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('dashboard.starred.showLess') : t('dashboard.starred.showAll', { count: filtered.length }) }}
        </Button>
      </div>
    </div>

    <p
      v-if="loaded && !all.length"
      class="border border-dashed border-border rounded-md px-3 py-2 text-xs text-muted-foreground m-0"
    >
      {{ t('dashboard.starred.empty') }}
    </p>

    <div v-show="!loaded || all.length" ref="grid" class="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
      <HomeItemTile
        v-for="item in visible"
        :key="key(item)"
        :type="item.type"
        :identifier="item.identifier"
        :name="item.name"
        :image="item.image"
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
    </div>
  </section>
</template>

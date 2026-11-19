<script setup lang="ts" generic="T">
import { computed, nextTick, ref } from 'vue';
import { useElementSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { HOME_LINK } from '@/config/homeStyles';

// One labelled row of Home tiles (Starred, Recently opened): as many as fit on one row, the
// rest behind its own "Show all", so one group never pushes the other off the page.
const props = defineProps<{ label: string; items: T[] }>();

// Matches the grid below: tiles at least 10.5rem (168px) wide, 12px apart.
const TILE_MIN = 168;
const GAP = 12;

const { t } = useI18n();

const grid = ref<HTMLElement | null>(null);
const { width } = useElementSize(grid);
// Before the grid is measured it assumes six to a row.
const columns = computed(() =>
  width.value ? Math.max(1, Math.floor((width.value + GAP) / (TILE_MIN + GAP))) : 6
);
const showAll = ref(false);
const hidden = computed(() => Math.max(0, props.items.length - columns.value));
const shown = computed(() =>
  showAll.value || !hidden.value ? props.items : props.items.slice(0, columns.value)
);

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
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-xs font-medium text-muted-foreground m-0">{{ label }}</h3>
      <button
        v-if="hidden || showAll"
        type="button"
        :class="[HOME_LINK, 'text-xs']"
        :aria-expanded="showAll"
        @click="toggleAll"
      >
        {{ showAll ? t('dashboard.continue.showLess') : t('dashboard.continue.showAll', { n: items.length }) }}
      </button>
    </div>
    <div ref="grid" class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
      <slot v-for="(item, index) in shown" :key="index" :item="item" />
    </div>
  </div>
</template>

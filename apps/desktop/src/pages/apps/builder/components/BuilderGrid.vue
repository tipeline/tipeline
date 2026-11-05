<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDownToLine, Copy, X } from 'lucide-vue-next';
import type { AppComponent } from '@tipeline/schemas';
import AppGrid from '@/components/app/AppGrid.vue';
import AppWidget from '@/components/app/AppWidget.vue';
import { PALETTE_BY_KEY, frameOf } from '@/components/app/widgets/registry';
import { toast } from '@/components/ui/sonner';
import { useBuilderStore } from '@/store/builderStore';
import { childrenOf, isContainer, listViewAround, refusedInside } from '@/utils/appTree';

// One editable grid of the selected page: the page's own (no parentId), or the grid
// inside a container or one tab of a tabs component. Container widgets render this
// again for their children (through APP_CANVAS), so palette drops — and components
// dragged in from another grid — land in the grid under the pointer.
const props = defineProps<{
  parentId?: string | null;
  tab?: string;
}>();

const { t } = useI18n();
const builderStore = useBuilderStore();

const parent = computed(() => (props.parentId ? { id: props.parentId, tab: props.tab } : null));
const items = computed(() => childrenOf(builderStore.selectedPage?.components ?? [], parent.value));

/** Says why a component can't go in this grid (a list view's item template). */
function refuse(type: string) {
  const list = listViewAround(builderStore.selectedPage?.components ?? [], props.parentId);
  toast.error(t('builder.listView.refused', { type: t(`builder.components.${type}`), list: list?.id ?? '' }));
}

// `key` is the palette item's: a type, or a preset of one (a stepper is tabs).
function onDrop(key: string, layout: { x: number; y: number; w: number; h: number }) {
  const entry = PALETTE_BY_KEY[key];
  if (!entry) return;
  if (refusedInside(builderStore.selectedPage?.components ?? [], [entry.type], props.parentId)) return refuse(entry.type);
  builderStore.addComponent(
    entry.type,
    layout,
    { name: t(`builder.components.${entry.key}`), props: entry.defaultProps },
    parent.value
  );
}

// A refused move (e.g. an input into a list view's template) leaves the component
// where it was — AppGrid already handed its element back.
function onMove(id: string, layout: { x: number; y: number; w: number; h: number }) {
  if (builderStore.moveComponent(id, parent.value, layout)) return;
  const type = builderStore.selectedPage?.components.find((c) => c.id === id)?.type;
  if (type && listViewAround(builderStore.selectedPage?.components ?? [], props.parentId)) refuse(type);
}

// Clicking the empty part of a container's grid selects the container.
function onSelect(id: string | null) {
  builderStore.selectComponent(id ?? props.parentId ?? null);
}

const frameless = (item: { id: string }) => frameOf(item as AppComponent) === 'none';

function duplicate(id: string) {
  const count = builderStore.duplicateComponent(id);
  if (count) toast(t('builder.copyDroppedActions', { count }));
}
</script>

<template>
  <AppGrid
    editable
    :nested="!!parentId"
    :items="items"
    :frameless="frameless"
    :selected-id="builderStore.selectedComponentId"
    @select="onSelect"
    @layout-change="builderStore.updateLayouts"
    @drop="onDrop"
    @remove="builderStore.removeComponent"
    @move="onMove"
  >
    <template #default="{ item }">
      <div class="relative h-full group/widget">
        <div class="absolute top-1 right-1 z-20 flex gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity">
          <button
            class="w-5 h-5 rounded bg-secondary text-secondary-foreground border flex items-center justify-center"
            :title="t('builder.duplicate')"
            @click.stop="duplicate(item.id)"
          >
            <Copy class="w-3 h-3" />
          </button>
          <button
            class="w-5 h-5 rounded bg-destructive text-destructive-foreground flex items-center justify-center"
            :title="t('common.remove')"
            @click.stop="builderStore.removeComponent(item.id)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
        <!-- Fill is only applied when the app runs; the canvas keeps the set height. -->
        <div
          v-if="(item as AppComponent).fill"
          class="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 px-1.5 h-5 rounded bg-secondary text-secondary-foreground border flex items-center gap-1 text-[10px] pointer-events-none"
        >
          <ArrowDownToLine class="w-3 h-3" />
          {{ t('builder.fill.marker') }}
        </div>
        <!-- Containers stay interactive: their tabs switch and their grid takes drops. -->
        <AppWidget
          editable
          :class="isContainer(item as AppComponent) ? '' : 'pointer-events-none select-none'"
          :component="(item as AppComponent)"
          :props="(item as AppComponent).props"
        />
      </div>
    </template>
  </AppGrid>
</template>

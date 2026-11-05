<script setup lang="ts">
import { computed, inject } from 'vue';
import type { AppComponent } from '@tipeline/schemas';
import AppGrid from './AppGrid.vue';
import StaticGrid from './StaticGrid.vue';
import AppWidget from './AppWidget.vue';
import { APP_ITEM_SCOPE, APP_PAGE_GRID } from './appCanvasKey';
import { collapseHidden, isHidden } from './widgets/visibility';
import { frameOf } from './widgets/registry';
import { childrenOf } from '@/utils/appTree';

// One grid of a running page: the page's own (no parentId), or the grid inside a
// container or one tab of a tabs component. Containers render this again for their
// children (through APP_CANVAS), so it nests to any depth. Inside a list view's item
// it is drawn for that item (bindings see `item` / `index`) on a plain, cheap grid.
const props = defineProps<{
  parentId?: string | null;
  tab?: string;
}>();

const ctx = inject(APP_PAGE_GRID)!;
const scope = inject(APP_ITEM_SCOPE, null);
const resolve = (c: AppComponent) => ctx.runtime.resolveProps(c, scope?.value);

// Hidden components (e.g. an alert with nothing to say) take no room: they leave the
// grid and the rows they free up close.
const items = computed(() =>
  collapseHidden(
    childrenOf(
      ctx.components(),
      props.parentId ? { id: props.parentId, tab: props.tab } : null
    ),
    (c) => isHidden(c.type, resolve(c as AppComponent))
  )
);
const frameless = (item: { id: string }) => frameOf(item as AppComponent) === 'none';
</script>

<template>
  <component :is="scope ? StaticGrid : AppGrid" :items="items" :nested="!!parentId" :frameless="frameless">
    <template #default="{ item }">
      <AppWidget
        :component="item as AppComponent"
        :props="resolve(item as AppComponent)"
        :state="ctx.runtime.components[item.id]"
        :busy="ctx.isBusy(item as AppComponent, scope ?? undefined)"
        :run="ctx.runStatus(item as AppComponent)"
        @event="
          (name, payload) =>
            ctx.runtime.handleComponentEvent(item as AppComponent, name, payload, scope ?? undefined)
        "
        @state="(patch) => ctx.runtime.setComponentState(item.id, patch)"
        @reset="ctx.runtime.resetComponent(item.id)"
      />
    </template>
  </component>
</template>

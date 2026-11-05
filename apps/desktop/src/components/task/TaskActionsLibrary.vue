<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ChevronRight } from 'lucide-vue-next';
import DraggableSubMenu from '@/components/task/DraggableSubMenu.vue';
import { useIcon } from '@/composables/useIcon';
const { getIconComponent } = useIcon();
const { t } = useI18n();

const props = defineProps({
  menuItems: {
    type: Array,
    required: true,
    default: () => [],
  },
});

// Adds the action as a new step at the end of the workflow (the parent decides how).
const emit = defineEmits(['add']);

const query = ref('');
const searchInputRef = ref(null);

defineExpose({
  focusSearch: () => searchInputRef.value?.focus(),
});

const isFiltering = computed(() => query.value.trim().length > 0);

const groupLabels = computed(() =>
  Object.fromEntries(props.menuItems.map((group) => [group.id, group.label]))
);

// One flat list while searching. An action matches on its own name, its group's
// name (so "browser" finds every browser action) or its description, ranked in
// that order; names that start with the query come first.
const searchResults = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  const ranked = [];
  for (const group of props.menuItems) {
    const groupMatches = group.label?.toLowerCase().includes(q);
    for (const child of group.children ?? []) {
      const label = child.label?.toLowerCase() ?? '';
      let rank = -1;
      if (label.startsWith(q)) rank = 0;
      else if (label.includes(q)) rank = 1;
      else if (groupMatches) rank = 2;
      else if (child.description?.toLowerCase().includes(q)) rank = 3;
      if (rank !== -1) ranked.push({ rank, order: ranked.length, child });
    }
  }
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((entry) => entry.child);
});

// The result Enter adds. Starts on the first result for every new query.
const activeIndex = ref(0);
watch(query, () => {
  activeIndex.value = 0;
});

function addAction(child) {
  emit('add', child);
  query.value = '';
}

function onSearchKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (query.value) query.value = '';
    else event.target.blur();
    return;
  }
  const count = searchResults.value.length;
  if (!count) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % count;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + count) % count;
  } else if (event.key === 'Enter') {
    event.preventDefault();
    addAction(searchResults.value[activeIndex.value]);
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 w-full min-h-0">
    <!-- Search input - always visible at top -->
    <div class="px-1 pb-2 shrink-0">
      <div class="relative">
        <Input
          ref="searchInputRef"
          v-model="query"
          :placeholder="t('actionsLibrary.searchPlaceholder')"
          class="h-8 text-sm pr-10"
          @keydown="onSearchKeydown"
        />
        <kbd
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
        >
          <template v-if="!isFiltering"><span class="text-xs">⌘</span>F</template>
          <template v-else>esc</template>
        </kbd>
      </div>
    </div>

    <!-- Actions list - scrolls independently -->
    <div class="flex-1 overflow-y-auto scroll-fade min-h-0">
    <SidebarProvider class="sidebar-provider-override">
      <SidebarMenu v-if="isFiltering" class="py-1">
        <template v-if="searchResults.length">
          <div class="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
            <span class="font-medium">{{ t('actionsLibrary.results', searchResults.length) }}</span>
            <span class="ml-auto">{{ t('actionsLibrary.resultsHint') }}</span>
          </div>
          <!-- Key forces DraggableSubMenu to remount when the results change -->
          <DraggableSubMenu
            :key="searchResults.map((c) => `${c.group}.${c.name}`).join(',')"
            :children="searchResults"
            results
            :query="query"
            :group-labels="groupLabels"
            :active-index="activeIndex"
            @add="addAction"
            @hover="activeIndex = $event"
          />
        </template>
        <div
          v-else
          class="px-2 py-4 text-sm text-muted-foreground text-center"
        >
          {{ t('actionsLibrary.noMatch', { query }) }}
        </div>
      </SidebarMenu>

      <SidebarMenu v-else class="py-2">
        <template v-for="(item, index) in menuItems" :key="item.id || item.name">
          <div
            v-if="item.isPlugin && !menuItems[index - 1]?.isPlugin"
            class="flex items-center gap-2 px-2 pt-3 pb-1"
          >
            <div class="h-px flex-1 bg-border" />
            <span class="text-xs text-muted-foreground font-medium shrink-0">{{ t('actionsLibrary.customPlugins') }}</span>
            <div class="h-px flex-1 bg-border" />
          </div>

          <SidebarMenuItem v-if="!item.children">
            <SidebarMenuButton as-child>
              <a :href="item.href || '#'" class="flex items-center gap-2">
                <component
                  v-if="item.icon"
                  :is="getIconComponent(item.icon)"
                  class="size-4"
                />
                <span>{{ item.label }}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <Collapsible v-else v-slot="{ open }">
            <SidebarMenuItem>
              <CollapsibleTrigger as-child>
                <SidebarMenuButton class="w-full">
                  <component
                    v-if="item.icon"
                    :is="getIconComponent(item.icon)"
                    class="size-4"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                  <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {{ item.children.length }}
                  </span>
                  <ChevronRight
                    class="size-4 transition-transform"
                    :class="open ? 'rotate-90' : ''"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </SidebarMenuItem>

            <CollapsibleContent>
              <!-- Key forces DraggableSubMenu to remount when its children change -->
              <DraggableSubMenu
                :key="item.children.map((c) => c.name).join(',')"
                :children="item.children"
                @add="addAction"
              />
            </CollapsibleContent>
          </Collapsible>
        </template>
      </SidebarMenu>
    </SidebarProvider>
    </div>
  </div>
</template>

<style scoped>
:deep(.sidebar-provider-override [data-slot='sidebar-wrapper']) {
  min-height: auto !important;
}

:deep([data-slot='sidebar-wrapper']) {
  min-height: auto !important;
}
</style>

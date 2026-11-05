<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Dialog from '@/components/Dialog.vue';
import { useIcon } from '@/composables/useIcon';
import { useBuilderStore } from '@/store/builderStore';
import { PALETTE, WIDGETS_BY_TYPE } from '@/components/app/widgets/registry';
import { computed } from 'vue';
import { Copy, Trash2 } from 'lucide-vue-next';
import { treeOrder } from '@/utils/appTree';

const builderStore = useBuilderStore();
const { getIconComponent } = useIcon();
const { t } = useI18n();

// Layers: the page's components in reading order (top to bottom, left to right),
// what is inside a container or tab indented under it.
const layers = computed(() => treeOrder(builderStore.selectedPage?.components ?? []));

const isNewPageDialogOpen = ref(false);
const newPageName = ref('');

function openNewPageDialog() {
  newPageName.value = '';
  isNewPageDialogOpen.value = true;
}

function handleNewPageSubmit() {
  const name = newPageName.value.trim();
  if (!name) return;
  builderStore.addPage(name);
  isNewPageDialogOpen.value = false;
}

// Pages reorder by dragging (or Alt+↑/↓); the first page is the app's home page.
// `dropIndex` is the gap the dragged page would land in: 0 is above the first page.
const draggedPageId = ref<string | null>(null);
const dropIndex = ref<number | null>(null);

function onPageDragStart(e: DragEvent, id: string) {
  draggedPageId.value = id;
  e.dataTransfer?.setData('text/plain', id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onPageDragOver(e: DragEvent, index: number) {
  if (!draggedPageId.value) return;
  e.preventDefault();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  dropIndex.value = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
}

function onPageDrop() {
  const id = draggedPageId.value;
  const gap = dropIndex.value;
  onPageDragEnd();
  if (!id || gap === null) return;
  const from = builderStore.source?.pages.findIndex((p) => p.id === id) ?? -1;
  // Taking the page out first shifts every gap below it up by one.
  builderStore.movePage(id, from < gap ? gap - 1 : gap);
}

function onPageDragEnd() {
  draggedPageId.value = null;
  dropIndex.value = null;
}

function onPageKeydown(e: KeyboardEvent, id: string, index: number) {
  if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  builderStore.movePage(id, index + (e.key === 'ArrowUp' ? -1 : 1));
}
</script>

<template>
  <Dialog v-model="isNewPageDialogOpen" :title="t('builder.newPage.title')" :description="t('builder.newPage.description')">
    <div class="flex flex-col gap-4 py-2">
      <div class="flex flex-col gap-1.5">
        <Label for="page-name">{{ t('builder.newPage.nameLabel') }}</Label>
        <Input
          id="page-name"
          v-model="newPageName"
          :placeholder="t('builder.newPage.namePlaceholder')"
          autofocus
          @keydown.enter="handleNewPageSubmit"
        />
      </div>
    </div>
    <template #footer>
      <Button variant="outline" @click="isNewPageDialogOpen = false">{{ t('common.cancel') }}</Button>
      <Button :disabled="!newPageName.trim()" @click="handleNewPageSubmit">{{ t('common.create') }}</Button>
    </template>
  </Dialog>

  <Sidebar side="left">
    <SidebarContent class="p-2">
      <SidebarGroup>
        <SidebarGroupContent>
          <Tabs default-value="components" class="w-full">
            <TabsList class="w-full">
              <TabsTrigger value="components">{{ t('builder.componentsTab') }}</TabsTrigger>
              <TabsTrigger value="layers">{{ t('builder.layersTab') }}</TabsTrigger>
              <TabsTrigger value="pages">{{ t('builder.pagesTab') }}</TabsTrigger>
            </TabsList>

            <!-- LAYERS -->
            <TabsContent value="layers" class="data-[state=inactive]:hidden">
              <div class="mt-3 mb-1">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">{{ builderStore.selectedPage?.name }}</span>
              </div>
              <Separator class="mb-2" />
              <p v-if="!layers.length" class="text-xs text-muted-foreground italic px-1">{{ t('builder.noComponents') }}</p>
              <div
                v-for="{ component: c, depth } in layers"
                :key="c.id"
                class="group/layer flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-accent"
                :class="{ 'bg-accent': builderStore.selectedComponentId === c.id }"
                :style="{ paddingLeft: `${0.5 + depth * 0.75}rem` }"
                @click="builderStore.selectComponent(c.id)"
              >
                <component :is="getIconComponent(WIDGETS_BY_TYPE[c.type]?.icon ?? 'Box')" class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="font-mono truncate flex-1">{{ c.id }}</span>
                <span class="text-muted-foreground shrink-0">{{ t(`builder.components.${c.type}`) }}</span>
                <button class="opacity-0 group-hover/layer:opacity-100" :title="t('builder.duplicate')" @click.stop="builderStore.duplicateComponent(c.id)">
                  <Copy class="size-3" />
                </button>
                <button class="opacity-0 group-hover/layer:opacity-100" :title="t('common.remove')" @click.stop="builderStore.removeComponent(c.id)">
                  <Trash2 class="size-3 text-destructive" />
                </button>
              </div>
            </TabsContent>

            <!-- PAGES -->
            <TabsContent value="pages" class="data-[state=inactive]:hidden">
              <div class="flex items-center justify-between mt-3 mb-1">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">{{ t('builder.pagesTab') }}</span>
                <Button size="sm" variant="ghost" class="h-6 w-6 p-0" @click="openNewPageDialog">
                  <component :is="getIconComponent('Plus')" class="w-3.5 h-3.5" />
                </Button>
              </div>
              <Separator class="mb-2" />
              <SidebarMenu v-if="builderStore.source">
                <SidebarMenuItem
                  v-for="(page, index) in builderStore.source.pages"
                  :key="page.id"
                  draggable="true"
                  :class="{
                    'opacity-50': draggedPageId === page.id,
                    'before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-primary': dropIndex === index,
                    'after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded after:bg-primary':
                      dropIndex === index + 1 && index === builderStore.source.pages.length - 1,
                  }"
                  @dragstart="onPageDragStart($event, page.id)"
                  @dragover="onPageDragOver($event, index)"
                  @drop.prevent="onPageDrop"
                  @dragend="onPageDragEnd"
                >
                  <SidebarMenuButton
                    :class="{ 'bg-accent': builderStore.selectedPageId === page.id }"
                    :title="t('builder.reorderPagesHint')"
                    @click="builderStore.selectPage(page.id)"
                    @keydown="onPageKeydown($event, page.id, index)"
                  >
                    <component :is="getIconComponent(page.icon || 'File') ?? getIconComponent('File')" class="w-3.5 h-3.5" />
                    <span class="truncate">{{ page.name }}</span>
                    <span class="ml-auto flex shrink-0 items-center gap-1.5">
                      <span
                        v-if="index === 0"
                        class="rounded border border-border px-1 text-[10px] leading-4 text-muted-foreground"
                        :title="t('builder.homePageHint')"
                      >{{ t('builder.homePage') }}</span>
                      <component
                        :is="getIconComponent('EyeOff')"
                        v-if="!page.showInMenu"
                        class="w-3 h-3 text-muted-foreground"
                      />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </TabsContent>

            <!-- COMPONENTS (force-mounted: the grid looks up the palette and trash at init) -->
            <TabsContent value="components" class="data-[state=inactive]:hidden" force-mount>
              <div class="mt-3 mb-1">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide">{{ t('builder.dragToCanvas') }}</span>
              </div>
              <Separator class="mb-3" />

              <div class="grid grid-cols-2 gap-2 px-1">
                <div
                  v-for="widget in PALETTE"
                  :key="widget.key"
                  class="app-palette-item grid-stack-item aspect-square border border-border rounded-md cursor-grab bg-background hover:border-primary hover:bg-accent/30 transition-colors"
                  :gs-w="widget.size.w"
                  :gs-h="widget.size.h"
                  :data-component-type="widget.key"
                >
                  <div class="grid-stack-item-content flex flex-col items-center justify-center h-full p-3 gap-1.5">
                    <component :is="getIconComponent(widget.icon)" class="size-4 text-muted-foreground shrink-0" />
                    <span class="text-xs font-medium text-foreground text-center leading-tight">
                      {{ t(`builder.components.${widget.key}`) }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="mt-4">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wide px-1">{{ t('builder.trash') }}</span>
                <div
                  id="app-builder-trash"
                  class="flex flex-col items-center justify-center p-4 mt-2 border-2 border-dashed border-destructive/40 rounded-md min-h-20 gap-1"
                >
                  <component :is="getIconComponent('Trash2')" class="size-4 text-destructive/60" />
                  <p class="m-0 text-destructive/70 text-xs">{{ t('builder.dropToRemove') }}</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>

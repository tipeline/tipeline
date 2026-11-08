<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchIcon, Workflow, AppWindow, Folders, TagIcon, Star } from 'lucide-vue-next';
import { invokeCore } from '@/utils/invoke';
import { toAssetUrl } from '@/utils/assetUrl';
import { SEND } from '@/ipc-channels';
import { searchAll, type SearchKind, type SearchResult, type SearchSources } from '@/utils/searchIndex';
import { useStarredItemsStore } from '@/store/starredItems';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { ENTITY_COLORS } from '@/config/entityColors';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const router = useRouter();
const { t } = useI18n();
const starred = useStarredItemsStore();
const recent = useRecentItemsStore();

const query = ref('');
const sources = ref<SearchSources>({ tasks: [], apps: [], projects: [] });
const searchInput = ref<InstanceType<typeof Input> | null>(null);
const activeIndex = ref(0);

const QUICK_ACCESS = 6;

type Group = { id: string; label: string; items: SearchResult[] };

// Before typing: starred, then recently opened. Both only list what still exists.
function quickAccess(): Group[] {
  const byKey = new Map<string, { name: string; image?: string | null }>();
  for (const x of sources.value.tasks) byKey.set(`task:${x.identifier}`, x);
  for (const x of sources.value.apps) byKey.set(`app:${x.identifier}`, x);
  for (const x of sources.value.projects) byKey.set(`project:${x.identifier}`, { name: x.name });

  const toResult = (item: { type: 'task' | 'app' | 'project'; identifier: string }): SearchResult[] => {
    const key = `${item.type}:${item.identifier}`;
    const live = byKey.get(key);
    return live ? [{ kind: item.type, key, title: live.name, image: live.image, path: recentItemPath(item) }] : [];
  };

  const starredItems = starred.items.flatMap(toResult).slice(0, QUICK_ACCESS);
  const seen = new Set(starredItems.map((i) => i.key));
  const recentItems = recent.items
    .flatMap(toResult)
    .filter((i) => !seen.has(i.key))
    .slice(0, QUICK_ACCESS);

  return [
    { id: 'starred', label: t('search.groups.starred'), items: starredItems },
    { id: 'recent', label: t('search.groups.recent'), items: recentItems },
  ].filter((g) => g.items.length);
}

const groupLabels = computed<Record<SearchKind, string>>(() => ({
  task: t('search.groups.workflows'),
  app: t('search.groups.apps'),
  project: t('search.groups.projects'),
  tag: t('search.groups.tags'),
}));

const groups = computed<Group[]>(() => {
  if (!query.value.trim()) return quickAccess();
  const results = searchAll(query.value, sources.value);
  return (['task', 'app', 'project', 'tag'] as SearchKind[])
    .map((kind) => ({ id: kind, label: groupLabels.value[kind], items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length);
});

const flat = computed(() => groups.value.flatMap((g) => g.items));

const kindIcons = { task: Workflow, app: AppWindow, project: Folders, tag: TagIcon } as const;
const kindTone: Record<string, string> = {
  task: ENTITY_COLORS.workflow.text,
  app: ENTITY_COLORS.app.text,
  project: ENTITY_COLORS.project.text,
  tag: 'text-muted-foreground',
};

async function load() {
  const [tasks, apps, projects] = await Promise.all([
    invokeCore<SearchSources['tasks']>(SEND.TASK_LIST).catch(() => null),
    invokeCore<SearchSources['apps']>(SEND.APP_LIST).catch(() => null),
    invokeCore<SearchSources['projects']>(SEND.PROJECT_LIST).catch(() => null),
  ]);
  sources.value = {
    tasks: tasks ?? sources.value.tasks,
    apps: apps ?? sources.value.apps,
    projects: projects ?? sources.value.projects,
  };
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      query.value = '';
      activeIndex.value = 0;
      // Refresh on every open: things may have been added or renamed since.
      void load();
      await nextTick();
      (searchInput.value?.$el ?? searchInput.value)?.focus();
    }
  }
);

watch(flat, () => {
  activeIndex.value = 0;
});

function close() {
  emit('update:open', false);
}

function select(result: SearchResult) {
  router.push(result.path);
  close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, flat.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    const result = flat.value[activeIndex.value];
    if (result) select(result);
  }
}

const indexOf = (result: SearchResult) => flat.value.indexOf(result);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="overflow-hidden p-0 gap-0 max-w-lg">
      <DialogTitle class="sr-only">{{ t('search.button') }}</DialogTitle>
      <div class="flex flex-col min-w-0" @keydown="onKeydown">
        <div class="flex items-center border-b px-3">
          <SearchIcon class="w-4 h-4 shrink-0 text-muted-foreground mr-2" />
          <Input
            ref="searchInput"
            v-model="query"
            :placeholder="t('search.placeholder')"
            class="border-0 shadow-none focus-visible:ring-0 h-12 text-sm"
          />
        </div>

        <div class="max-h-96 overflow-y-auto overflow-x-hidden py-1">
          <template v-if="flat.length > 0">
            <section v-for="group in groups" :key="group.id">
              <h3 class="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground m-0">
                <Star v-if="group.id === 'starred'" class="w-3 h-3" />
                {{ group.label }}
              </h3>
              <button
                v-for="result in group.items"
                :key="`${group.id}:${result.key}`"
                type="button"
                class="w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                :class="indexOf(result) === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
                @click="select(result)"
                @mouseenter="activeIndex = indexOf(result)"
              >
                <div class="size-7 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="toAssetUrl(result.image)" :src="toAssetUrl(result.image)!" class="w-full h-full object-cover" />
                  <span
                    v-else-if="result.kind === 'project' && result.color"
                    class="w-2.5 h-2.5 rounded-full"
                    :style="{ backgroundColor: result.color }"
                  />
                  <component :is="kindIcons[result.kind]" v-else class="w-4 h-4" :class="kindTone[result.kind]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-medium truncate">{{ result.title }}</div>
                  <div v-if="result.subtitle && result.kind !== 'tag'" class="text-xs text-muted-foreground truncate">
                    {{ result.subtitle }}
                  </div>
                </div>
                <span v-if="result.kind === 'tag'" class="text-xs text-muted-foreground shrink-0">
                  {{ t('search.tagCount', Number(result.subtitle)) }}
                </span>
              </button>
            </section>
          </template>
          <p v-else-if="query.trim()" class="px-3 py-6 text-center text-sm text-muted-foreground">
            {{ t('search.noResults') }}
          </p>
          <p v-else class="px-3 py-6 text-center text-sm text-muted-foreground">
            {{ t('search.hint') }}
          </p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

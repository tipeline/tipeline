<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronRight, History } from 'lucide-vue-next';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import { recentItemPath, type RecentItem } from '@/store/recentItems';

// The row of workflows or apps opened last, above their list page. One scrolling row so the
// list below keeps its height; "See all" switches the list to its Recently opened scope.
// It can be folded to its title line, remembered per list, to leave more room for the list.
const props = defineProps<{ type: 'task' | 'app'; items: RecentItem[] }>();
const emit = defineEmits<{ seeAll: []; clear: [] }>();

const { t } = useI18n();
const router = useRouter();

const storageKey = `tipeline.recentRow.collapsed.${props.type}`;
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}
const collapsed = ref(readCollapsed());
watch(collapsed, (value) => {
  try {
    if (value) localStorage.setItem(storageKey, '1');
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
});
</script>

<template>
  <section class="shrink-0" :class="collapsed ? 'mb-2' : 'mb-4'">
    <div class="flex items-center gap-2" :class="{ 'mb-2': !collapsed }">
      <button
        type="button"
        class="flex items-center gap-2 rounded-sm hover:text-foreground"
        :aria-expanded="!collapsed"
        :title="collapsed ? t('recentRow.show') : t('recentRow.hide')"
        @click="collapsed = !collapsed"
      >
        <component :is="collapsed ? ChevronRight : ChevronDown" class="size-4 text-muted-foreground" />
        <History class="size-4 text-muted-foreground" />
        <h2 class="text-sm font-semibold m-0">{{ t('recentRow.title') }}</h2>
        <span v-if="collapsed" class="text-xs text-muted-foreground tabular-nums">{{ items.length }}</span>
      </button>
      <button type="button" class="ml-auto text-xs text-muted-foreground hover:text-foreground" @click="emit('clear')">
        {{ t('recentRow.clear') }}
      </button>
      <button type="button" class="text-xs text-primary hover:underline" @click="emit('seeAll')">
        {{ t('recentRow.seeAll') }}
      </button>
    </div>
    <div v-if="!collapsed" class="flex gap-3 overflow-x-auto pb-1">
      <HomeItemTile
        v-for="item in items"
        :key="item.identifier"
        class="w-48 shrink-0"
        :type="type"
        :identifier="item.identifier"
        :name="item.name"
        :image="item.image"
        :subtitle="formatDistanceToNow(new Date(item.openedAt), { addSuffix: true })"
        starrable
        @open="router.push(recentItemPath(item))"
      />
    </div>
  </section>
</template>

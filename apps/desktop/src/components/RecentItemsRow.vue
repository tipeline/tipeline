<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { History } from 'lucide-vue-next';
import HomeItemTile from '@/components/home/HomeItemTile.vue';
import { recentItemPath, type RecentItem } from '@/store/recentItems';

// The row of workflows or apps opened last, above their list page. One scrolling row so the
// list below keeps its height; "See all" switches the list to its Recently opened scope.
defineProps<{ type: 'task' | 'app'; items: RecentItem[] }>();
const emit = defineEmits<{ seeAll: []; clear: [] }>();

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <section class="shrink-0 mb-4">
    <div class="flex items-center gap-2 mb-2">
      <History class="size-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold m-0">{{ t('recentRow.title') }}</h2>
      <button type="button" class="ml-auto text-xs text-muted-foreground hover:text-foreground" @click="emit('clear')">
        {{ t('recentRow.clear') }}
      </button>
      <button type="button" class="text-xs text-primary hover:underline" @click="emit('seeAll')">
        {{ t('recentRow.seeAll') }}
      </button>
    </div>
    <div class="flex gap-3 overflow-x-auto pb-1">
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

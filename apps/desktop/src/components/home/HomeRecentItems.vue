<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Workflow, Folders, AppWindow } from 'lucide-vue-next';
import Card from '@/components/Card.vue';
import StarButton from '@/components/StarButton.vue';
import { useRecentItemsStore, recentItemPath } from '@/store/recentItems';
import { useLiveItems } from '@/composables/useLiveItems';
import { toAssetUrl } from '@/utils/assetUrl';

// A compact list, so it reads as history next to the Starred tiles; it scrolls after ~7 rows.
// The store keeps more, so deleted items don't leave the list short.
const MAX_SHOWN = 20;

const { t } = useI18n();
const router = useRouter();
const recentItemsStore = useRecentItemsStore();
const { loaded, keepLive } = useLiveItems();

const items = computed(() =>
  loaded.value ? keepLive(recentItemsStore.recent(undefined, Infinity)).slice(0, MAX_SHOWN) : []
);

const typeIcons = { task: Workflow, project: Folders, app: AppWindow } as const;
const typeTint = {
  task: 'bg-blue-500/10 text-blue-500',
  project: 'bg-violet-500/10 text-violet-500',
  app: 'bg-amber-500/10 text-amber-500',
} as const;
</script>

<template>
  <Card classContent="p-0">
    <template #title>{{ t('dashboard.recentItems.title') }}</template>
    <template #content>
      <div v-if="items.length" class="max-h-72 overflow-y-auto scroll-fade divide-y divide-border">
        <div
          v-for="item in items"
          :key="`${item.type}:${item.identifier}`"
          class="group flex items-center gap-2 pr-4 hover:bg-muted/50 transition-colors"
        >
          <button
            type="button"
            class="flex items-center gap-3 flex-1 min-w-0 pl-6 py-2 text-left"
            @click="router.push(recentItemPath(item))"
          >
            <span
              class="flex items-center justify-center w-7 h-7 rounded-md shrink-0 overflow-hidden"
              :class="toAssetUrl(item.image) ? '' : typeTint[item.type]"
            >
              <img v-if="toAssetUrl(item.image)" :src="toAssetUrl(item.image)!" class="w-full h-full object-cover" />
              <component :is="typeIcons[item.type]" v-else class="w-3.5 h-3.5" />
            </span>
            <p class="text-sm font-medium truncate flex-1 min-w-0 m-0">{{ item.name }}</p>
            <span class="text-xs text-muted-foreground shrink-0">
              {{ formatDistanceToNow(new Date(item.openedAt), { addSuffix: true }) }}
            </span>
          </button>
          <StarButton
            v-if="item.type !== 'project'"
            :type="item.type"
            :identifier="item.identifier"
            :name="item.name"
            :image="item.image"
            subtle
          />
          <span v-else class="w-6 shrink-0" />
        </div>
      </div>
      <p v-else-if="loaded" class="text-sm text-muted-foreground px-6 pb-5 m-0">
        {{ t('dashboard.recentItems.empty') }}
      </p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-vue-next';
import HubUpdateDialog from '@/components/hub/HubUpdateDialog.vue';
import { useHubUpdatesStore, type HubUpdateEvent } from '@/store/hubUpdatesStore';
import { storeToRefs } from 'pinia';

const { t } = useI18n();
const store = useHubUpdatesStore();
const { needsYou, history, loaded } = storeToRefs(store);

const reviewing = ref<HubUpdateEvent | null>(null);
const reviewOpen = computed({
  get: () => !!reviewing.value,
  set: (open: boolean) => {
    if (!open) reviewing.value = null;
  },
});

const ITEM_ROUTE = { task: '/tasks', app: '/apps', plugin: '/plugins' };
const itemLink = (event: HubUpdateEvent) => `${ITEM_ROUTE[event.item_type]}/${event.item_identifier}`;
const typeLabel = (event: HubUpdateEvent) => t(`hub.updates.type.${event.item_type}`);
const canInstall = (event: HubUpdateEvent) => event.kind === 'major_waiting' || event.kind === 'update_available';
const ago = (value: string) => {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return formatDistanceToNow(date, { addSuffix: true });
};

const describe = (event: HubUpdateEvent) =>
  t(`hub.updates.kind.${event.kind}`, { from: event.from_version ?? '—', to: event.to_version ?? '—' });

onMounted(async () => {
  await store.refresh();
  await store.markAllRead();
});
</script>

<template>
  <div class="h-full overflow-y-auto scroll-fade space-y-6 pb-4">
    <div v-if="!loaded" class="flex justify-center py-12">
      <Loader2Icon class="size-5 animate-spin text-muted-foreground" />
    </div>

    <p v-else-if="!needsYou.length && !history.length" class="text-sm text-muted-foreground py-12 text-center m-0">
      {{ t('hub.updates.empty') }}
    </p>

    <template v-else>
      <section v-if="needsYou.length" class="space-y-2">
        <h3 class="text-sm font-semibold m-0">{{ t('hub.updates.needsYou') }}</h3>
        <div
          v-for="event in needsYou"
          :key="event.id"
          class="flex items-center gap-3 rounded-md border p-3"
          :class="['failed', 'blocked', 'not_bumped'].includes(event.kind) ? 'border-destructive/40' : ''"
        >
          <div class="min-w-0 flex-1 space-y-0.5">
            <p class="text-sm m-0 truncate">
              <RouterLink :to="itemLink(event)" class="font-medium hover:underline">
                {{ event.item_name ?? event.item_identifier }}
              </RouterLink>
              <span class="text-xs text-muted-foreground"> · {{ typeLabel(event) }} · {{ event.hub_name }}</span>
            </p>
            <p class="text-sm text-muted-foreground m-0">{{ describe(event) }}</p>
            <p v-if="event.kind === 'failed' && event.message" class="text-xs text-destructive m-0 break-words">
              {{ event.message }}
            </p>
          </div>
          <Button v-if="canInstall(event)" variant="outline" size="sm" @click="reviewing = event">
            {{ t('hub.reviewUpdate') }}
          </Button>
        </div>
      </section>

      <section v-if="history.length" class="space-y-2">
        <h3 class="text-sm font-semibold m-0">{{ t('hub.updates.history') }}</h3>
        <div v-for="event in history" :key="event.id" class="flex items-baseline gap-3 text-sm">
          <RouterLink :to="itemLink(event)" class="font-medium hover:underline truncate">
            {{ event.item_name ?? event.item_identifier }}
          </RouterLink>
          <span class="text-muted-foreground truncate">{{ describe(event) }}</span>
          <span class="ml-auto text-xs text-muted-foreground shrink-0">{{ ago(event.created_at) }}</span>
        </div>
      </section>
    </template>

    <HubUpdateDialog
      v-if="reviewing"
      v-model="reviewOpen"
      :type="reviewing.item_type"
      :identifier="reviewing.item_identifier"
    />
  </div>
</template>

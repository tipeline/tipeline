<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import HubUpdateDialog from '@/components/hub/HubUpdateDialog.vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { useHubUpdatesStore, type HubItemType } from '@/store/hubUpdatesStore';

/**
 * Where an item installed from a hub stands: the hub's name and status, the way to take
 * an update, and the Auto-update switch. Shared by workflows, apps and plugins.
 */
const props = defineProps<{ item: any; type: HubItemType }>();
const emit = defineEmits<{ (e: 'changed', fields: Record<string, unknown>): void }>();

const { t } = useI18n();
const router = useRouter();
const hubUpdates = useHubUpdatesStore();

const UPDATE_CHANNEL = {
  task: SEND.HUB_UPDATE_TASK,
  app: SEND.HUB_UPDATE_APP,
  plugin: SEND.HUB_UPDATE_PLUGIN,
};
const AUTO_UPDATE_CHANNEL = {
  task: SEND.HUB_SET_TASK_AUTO_UPDATE,
  app: SEND.HUB_SET_APP_AUTO_UPDATE,
  plugin: SEND.HUB_SET_PLUGIN_AUTO_UPDATE,
};

const status = computed<'ok' | 'missing' | 'error'>(() => props.item?.hub_status ?? 'ok');
// While the item is unhealthy its listed version says nothing about what can be installed.
const state = computed(() => (status.value === 'ok' ? props.item?.hub_update_state : 'current'));
const version = computed(() => props.item?.hub_version);

const dotClass = computed(() => {
  if (status.value === 'missing') return 'bg-slate-400';
  if (status.value === 'error') return 'bg-red-500';
  return state.value === 'available' || state.value === 'major' || state.value === 'older'
    ? 'bg-amber-500'
    : 'bg-emerald-500';
});
const tooltip = computed(() => {
  if (status.value === 'missing') return t('hub.sourceMissing');
  if (status.value === 'error') return t('hub.syncError');
  if (state.value === 'major') return t('hub.majorAvailableDetail', { version: version.value });
  if (state.value === 'available') return t('hub.updateAvailableDetail', { version: version.value });
  if (state.value === 'older') return t('hub.olderListedDetail', { version: version.value });
  return t('hub.upToDate');
});

const isUpdating = ref(false);
const reviewOpen = ref(false);

async function updateNow() {
  isUpdating.value = true;
  try {
    const updated = await invokeCore<any>(UPDATE_CHANNEL[props.type], { identifier: props.item.identifier });
    emit('changed', updated);
  } catch (e: any) {
    emit('changed', { hub_status: 'error' });
    toast.error(t('hub.updateFailed'), { description: e?.message ?? String(e) });
  } finally {
    isUpdating.value = false;
    void hubUpdates.refresh();
  }
}

async function toggleAutoUpdate(value: boolean) {
  await invokeCore(AUTO_UPDATE_CHANNEL[props.type], { identifier: props.item.identifier, autoUpdate: value });
  emit('changed', { auto_update: value });
}
</script>

<template>
  <div class="space-y-1">
    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {{ t('hub.title') }}
    </div>
    <div class="flex items-center gap-1.5 min-w-0">
      <span class="inline-flex h-1.5 w-1.5 rounded-full shrink-0" :class="dotClass" :title="tooltip" />
      <span class="text-sm truncate">{{ item.hub_name ?? '—' }}</span>
    </div>
    <p v-if="state === 'major' || state === 'older'" class="text-xs text-amber-700 dark:text-amber-400 m-0">
      {{ tooltip }}
    </p>
    <div class="flex items-center gap-3 pt-0.5">
      <button
        v-if="state === 'available'"
        class="text-xs text-primary hover:underline disabled:opacity-50"
        :disabled="isUpdating"
        @click="updateNow"
      >
        {{ isUpdating ? t('hub.updating') : t('hub.updateNow') }}
      </button>
      <button
        v-else-if="state === 'major'"
        class="text-xs text-primary hover:underline"
        @click="reviewOpen = true"
      >
        {{ t('hub.reviewUpdate') }}
      </button>
      <button
        v-else-if="status === 'error'"
        class="text-xs text-primary hover:underline"
        @click="router.push({ name: 'HubUpdates' })"
      >
        {{ t('hub.seeWhy') }}
      </button>
      <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <Switch class="scale-75" :model-value="!!item.auto_update" @update:model-value="toggleAutoUpdate" />
        {{ t('hub.autoUpdate') }}
      </label>
    </div>
    <HubUpdateDialog
      v-model="reviewOpen"
      :type="type"
      :identifier="item.identifier"
      @updated="(updated) => emit('changed', updated)"
    />
  </div>
</template>

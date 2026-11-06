<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { beautifyObjectName } from '@/components/ui/auto-form/utils';
import { useSettingsStore } from '@/store/settingsStore';
import { useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';
import {
  DEFAULT_AUTHOR_KEY,
  DEFAULT_PLATFORM_CURRENT_KEY,
  getSystemInfo,
  type SystemInfo,
} from '@/composables/useNewItemDefaults';

const { t } = useI18n();
const settingsStore = useSettingsStore();
const autoSave = useAutoSave();

const systemInfo = ref<SystemInfo>({ platform: null, username: '' });
onMounted(async () => (systemInfo.value = await getSystemInfo()));

const author = ref(settingsStore.get(DEFAULT_AUTHOR_KEY));
// Settings may still be loading when the page opens. Only a reload fills the field: copying
// back our own save would undo whatever was typed while it was on its way.
watch(
  () => settingsStore.settings,
  () => (author.value = settingsStore.get(DEFAULT_AUTHOR_KEY))
);

function queueAuthor() {
  autoSave.schedule(DEFAULT_AUTHOR_KEY, async () => {
    const value = author.value.trim();
    if (value !== settingsStore.get(DEFAULT_AUTHOR_KEY)) {
      await settingsStore.set(DEFAULT_AUTHOR_KEY, value);
    }
  });
}

function saveAuthor() {
  author.value = author.value.trim();
  queueAuthor();
  void autoSave.flush(DEFAULT_AUTHOR_KEY);
}

function useAccountName() {
  author.value = systemInfo.value.username;
  saveAuthor();
}

const usePlatform = computed({
  get: () => settingsStore.get(DEFAULT_PLATFORM_CURRENT_KEY) === 'true',
  set: (on: boolean) =>
    void autoSave.save(DEFAULT_PLATFORM_CURRENT_KEY, () =>
      settingsStore.set(DEFAULT_PLATFORM_CURRENT_KEY, on ? 'true' : 'false')
    ),
});
</script>

<template>
  <section class="space-y-6">
    <p class="text-sm text-muted-foreground">
      {{ t('settings.defaults.description') }} {{ t('settings.autoSave.note') }}
    </p>

    <!-- Author -->
    <div class="flex items-start justify-between gap-6">
      <div>
        <label for="default-author" class="text-sm font-medium">{{ t('settings.defaults.author') }}</label>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.defaults.authorHint') }}</div>
        <button
          v-if="!author && systemInfo.username"
          type="button"
          class="text-xs text-primary hover:underline mt-1"
          @click="useAccountName"
        >
          {{ t('settings.defaults.useAccountName', { name: systemInfo.username }) }}
        </button>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <Input
          id="default-author"
          v-model="author"
          class="w-55 text-sm"
          :placeholder="systemInfo.username || t('tasks.form.authorPlaceholder')"
          @update:model-value="queueAuthor"
          @blur="saveAuthor"
          @keydown.enter="saveAuthor"
        />
        <SaveStatus v-bind="autoSave.status(DEFAULT_AUTHOR_KEY)" />
      </div>
    </div>

    <!-- Platform -->
    <div class="flex items-start justify-between gap-6">
      <div>
        <label for="default-platform" class="text-sm font-medium">{{ t('settings.defaults.platform') }}</label>
        <div class="text-xs text-muted-foreground mt-0.5">
          {{
            systemInfo.platform
              ? t('settings.defaults.platformHint', { platform: beautifyObjectName(systemInfo.platform) })
              : t('settings.defaults.platformHintUnknown')
          }}
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <SaveStatus v-bind="autoSave.status(DEFAULT_PLATFORM_CURRENT_KEY)" />
        <Switch id="default-platform" v-model="usePlatform" />
      </div>
    </div>
  </section>
</template>

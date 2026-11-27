<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const systemInfo = ref<SystemInfo>({ platform: null, username: '', fullName: '' });
onMounted(async () => (systemInfo.value = await getSystemInfo()));
// What "Use …" fills in: the full name where the OS keeps one (the welcome screen offers the same).
const accountName = computed(() => systemInfo.value.fullName || systemInfo.value.username);

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
  author.value = accountName.value;
  saveAuthor();
}

// Same words as the platform pickers: this computer's platform, or "Any platform".
const platformChoice = computed({
  get: () => (settingsStore.get(DEFAULT_PLATFORM_CURRENT_KEY) === 'true' ? 'current' : 'any'),
  set: (choice: unknown) =>
    void autoSave.save(DEFAULT_PLATFORM_CURRENT_KEY, () =>
      settingsStore.set(DEFAULT_PLATFORM_CURRENT_KEY, choice === 'current' ? 'true' : 'false')
    ),
});
const currentPlatformLabel = computed(() =>
  systemInfo.value.platform
    ? t('settings.defaults.platformCurrent', { platform: beautifyObjectName(systemInfo.value.platform) })
    : t('settings.defaults.platformCurrentUnknown')
);
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
          v-if="!author && accountName"
          type="button"
          class="text-xs text-primary hover:underline mt-1"
          @click="useAccountName"
        >
          {{ t('settings.defaults.useAccountName', { name: accountName }) }}
        </button>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <Input
          id="default-author"
          v-model="author"
          class="w-55 text-sm"
          :placeholder="accountName || t('tasks.form.authorPlaceholder')"
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
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.defaults.platformHint') }}</div>
      </div>
      <div class="flex flex-col items-end gap-1 shrink-0">
        <Select v-model="platformChoice">
          <SelectTrigger id="default-platform" class="w-55 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">{{ currentPlatformLabel }}</SelectItem>
            <SelectItem value="any">{{ t('tasks.form.platformAny') }}</SelectItem>
          </SelectContent>
        </Select>
        <SaveStatus v-bind="autoSave.status(DEFAULT_PLATFORM_CURRENT_KEY)" />
      </div>
    </div>
  </section>
</template>

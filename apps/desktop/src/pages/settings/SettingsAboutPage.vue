<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { Switch } from '@/components/ui/switch';
import { useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';

const { t } = useI18n();
const autoSave = useAutoSave();

const desktopVersion = ref('');
const coreVersion = ref<string | null>(null);
const coreUnavailable = ref(false);

const autoStart = ref<{ available: boolean; restartsOnCrash: boolean; enabled: boolean } | null>(null);

function setAutoStart(enabled: boolean) {
  void autoSave.save('autoStart', async () => {
    autoStart.value = await window.ipcRenderer.invoke(SEND.AUTO_START_SET, enabled);
  });
}

onMounted(async () => {
  autoStart.value = await window.ipcRenderer.invoke(SEND.AUTO_START_GET);
  desktopVersion.value = await window.ipcRenderer.invoke(SEND.APP_VERSION);

  try {
    const status = await invokeCore<{ version?: string }>(SEND.STATUS);
    coreVersion.value = status?.version ?? null;
  } catch {
    coreUnavailable.value = true;
  }
});
</script>

<template>
  <section class="space-y-6">
    <div>
      <div class="text-sm font-medium">{{ t('settings.about.title') }}</div>
      <div class="text-xs text-muted-foreground mt-0.5">
        {{ t('settings.about.description') }} {{ t('settings.autoSave.note') }}
      </div>
    </div>

    <div class="rounded-lg border divide-y">
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm">{{ t('settings.about.desktopVersion') }}</span>
        <span class="text-sm text-muted-foreground">{{ desktopVersion || t('settings.about.unknown') }}</span>
      </div>
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm">{{ t('settings.about.coreVersion') }}</span>
        <span class="text-sm text-muted-foreground">
          {{ coreUnavailable ? t('settings.about.unavailable') : coreVersion || t('settings.about.unknown') }}
        </span>
      </div>
    </div>

    <div v-if="autoStart?.available" class="rounded-lg border flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <label for="auto-start" class="text-sm">{{ t('settings.about.autoStart') }}</label>
        <div class="text-xs text-muted-foreground mt-0.5">
          {{ t(autoStart.restartsOnCrash ? 'settings.about.autoStartHint' : 'settings.about.autoStartHintLogin') }}
        </div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <SaveStatus v-bind="autoSave.status('autoStart')" />
        <Switch id="auto-start" :model-value="autoStart.enabled" @update:model-value="setAutoStart" />
      </div>
    </div>
  </section>
</template>

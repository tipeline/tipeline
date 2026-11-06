<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/store/settingsStore';
import { InvalidValue, useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';

// Mirrors RUN_KEEP_DAYS_SETTING / DEFAULT_RUN_KEEP_DAYS in core's RunHistoryPurger.
const KEEP_DAYS_SETTING = 'runs.keepDays';
const DEFAULT_KEEP_DAYS = 90;

const { t } = useI18n();
const settingsStore = useSettingsStore();
const autoSave = useAutoSave();

const days = ref(String(DEFAULT_KEEP_DAYS));
const forever = ref(false);

onMounted(async () => {
  await settingsStore.load();
  const saved = settingsStore.get(KEEP_DAYS_SETTING, String(DEFAULT_KEEP_DAYS));
  forever.value = saved === '0';
  days.value = saved === '0' ? String(DEFAULT_KEEP_DAYS) : saved;
});

function daysValue() {
  const value = Number(days.value);
  if (!Number.isInteger(value) || value <= 0) throw new InvalidValue(t('runHistory.invalid'));
  return String(value);
}

function queueDays() {
  autoSave.schedule('days', () => settingsStore.set(KEEP_DAYS_SETTING, daysValue()));
}

function setForever(value: boolean) {
  forever.value = value;
  void autoSave.save('forever', () =>
    settingsStore.set(KEEP_DAYS_SETTING, value ? '0' : daysValue())
  );
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <div class="text-sm font-medium">{{ t('runHistory.title') }}</div>
      <div class="text-xs text-muted-foreground mt-0.5">
        {{ t('runHistory.hint') }} {{ t('settings.autoSave.note') }}
      </div>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-medium">{{ t('runHistory.keepForever') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('runHistory.keepForeverHint') }}</div>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        <SaveStatus v-bind="autoSave.status('forever')" />
        <Switch :model-value="forever" @update:model-value="setForever" />
      </div>
    </div>

    <div v-if="!forever" class="space-y-1.5">
      <label for="run-keep-days" class="text-sm font-medium">{{ t('runHistory.keepFor') }}</label>
      <div class="flex items-center gap-2">
        <Input
          id="run-keep-days"
          v-model="days"
          type="number"
          min="1"
          class="w-32"
          @update:model-value="queueDays"
          @blur="autoSave.flush('days')"
          @keydown.enter="autoSave.flush('days')"
        />
        <span class="text-sm text-muted-foreground">{{ t('runHistory.days') }}</span>
        <SaveStatus v-bind="autoSave.status('days')" />
      </div>
    </div>
  </section>
</template>

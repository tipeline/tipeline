<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from '@/components/ui/button/Button.vue';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';

// Mirrors RUN_KEEP_DAYS_SETTING / DEFAULT_RUN_KEEP_DAYS in core's RunHistoryPurger.
const KEEP_DAYS_SETTING = 'runs.keepDays';
const DEFAULT_KEEP_DAYS = 90;

const { t } = useI18n();
const { translateError } = useErrorT();
const settingsStore = useSettingsStore();

const days = ref(String(DEFAULT_KEEP_DAYS));
const forever = ref(false);

onMounted(async () => {
  await settingsStore.load();
  const saved = settingsStore.get(KEEP_DAYS_SETTING, String(DEFAULT_KEEP_DAYS));
  forever.value = saved === '0';
  days.value = saved === '0' ? String(DEFAULT_KEEP_DAYS) : saved;
});

async function save(value: string) {
  try {
    await settingsStore.set(KEEP_DAYS_SETTING, value);
    toast.success(t('runHistory.saved'));
  } catch (err) {
    toast.error(t('runHistory.saveFailed'), { description: translateError(String((err as Error)?.message ?? err)) });
  }
}

function saveDays() {
  const value = Number(days.value);
  if (!Number.isInteger(value) || value <= 0) {
    toast.error(t('runHistory.invalid'));
    return;
  }
  void save(String(value));
}

function setForever(value: boolean) {
  forever.value = value;
  void save(value ? '0' : days.value);
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <div class="text-sm font-medium">{{ t('runHistory.title') }}</div>
      <div class="text-xs text-muted-foreground mt-0.5">{{ t('runHistory.hint') }}</div>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-medium">{{ t('runHistory.keepForever') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('runHistory.keepForeverHint') }}</div>
      </div>
      <Switch :model-value="forever" @update:model-value="setForever" />
    </div>

    <div v-if="!forever" class="space-y-1.5">
      <label for="run-keep-days" class="text-sm font-medium">{{ t('runHistory.keepFor') }}</label>
      <div class="flex items-center gap-2">
        <Input id="run-keep-days" v-model="days" type="number" min="1" class="w-32" />
        <span class="text-sm text-muted-foreground">{{ t('runHistory.days') }}</span>
        <Button variant="outline" size="sm" @click="saveDays">{{ t('common.save') }}</Button>
      </div>
    </div>
  </section>
</template>

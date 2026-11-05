<script setup lang="ts">
import { useColorMode } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { Sun, Moon, Monitor } from 'lucide-vue-next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale, SUPPORTED_LANGUAGES, type SupportedLocale } from '@/composables/useLocale';
import { useTimezone } from '@/composables/useTimezone';

const mode = useColorMode();
const { t } = useI18n();
const { currentLocale, setLocale } = useLocale();
const { appTimezone, setTimezone } = useTimezone();

const TIMEZONES = Intl.supportedValuesOf('timeZone');

const THEMES = [
  { value: 'light', label: () => t('settings.light'), icon: Sun },
  { value: 'dark', label: () => t('settings.dark'), icon: Moon },
  { value: 'auto', label: () => t('settings.system'), icon: Monitor },
] as const;
</script>

<template>
  <section class="space-y-6">
    <!-- Theme -->
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">{{ t('settings.theme') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.appearance.themeHint') }}</div>
      </div>
      <div class="flex gap-1 rounded-lg border p-1">
        <button
          v-for="theme in THEMES"
          :key="theme.value"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
          :class="mode === theme.value
            ? 'bg-foreground text-background'
            : 'hover:bg-accent text-muted-foreground'"
          @click="mode = theme.value"
        >
          <component :is="theme.icon" class="h-3.5 w-3.5" />
          {{ theme.label() }}
        </button>
      </div>
    </div>

    <!-- Language -->
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">{{ t('settings.language') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.appearance.languageHint') }}</div>
      </div>
      <Select :model-value="currentLocale" @update:model-value="setLocale($event as SupportedLocale)">
        <SelectTrigger class="w-40 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">
            {{ lang.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Timezone -->
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">{{ t('settings.timezone') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.appearance.timezoneHint') }}</div>
      </div>
      <Select :model-value="appTimezone" @update:model-value="setTimezone($event as string)">
        <SelectTrigger class="w-55 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </section>
</template>

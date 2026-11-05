<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Page from '@/components/Page.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tab = ref('SettingsAppearance');

watch(
  () => route.name,
  (newName) => {
    if (typeof newName === 'string' && tab.value !== newName) {
      tab.value = newName;
    }
  },
  { immediate: true }
);

watch(tab, (newTab) => {
  if (newTab !== route.name) {
    router.push({ name: newTab });
  }
});
</script>

<template>
  <Page scrollable>
    <template #title>{{ t('settings.title') }}</template>
    <template #content>
      <div class="max-w-2xl">
        <Tabs v-model="tab" class="mb-6">
          <TabsList>
            <TabsTrigger value="SettingsAppearance">{{ t('settings.appearance.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsDefaults">{{ t('settings.defaults.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsAgent">{{ t('settings.agent.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsBackup">{{ t('settings.backup.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsHubs">{{ t('settings.hubs.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsRunHistory">{{ t('runHistory.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsCache">{{ t('cache.settings.title') }}</TabsTrigger>
            <TabsTrigger value="SettingsAbout">{{ t('settings.about.title') }}</TabsTrigger>
          </TabsList>
        </Tabs>
        <RouterView />
      </div>
    </template>
  </Page>
</template>

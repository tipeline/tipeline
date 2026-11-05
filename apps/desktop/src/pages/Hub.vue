<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Page from '@/components/Page.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tab = ref('HubTasks');

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
  <Page>
    <template #title>{{ t('hub.title') }}</template>
    <template #content>
      <Tabs v-model="tab" class="mb-4">
        <TabsList>
          <TabsTrigger value="HubTasks">{{ t('hub.tabs.tasks') }}</TabsTrigger>
          <TabsTrigger value="HubApps">{{ t('hub.tabs.apps') }}</TabsTrigger>
          <TabsTrigger value="HubPlugins">{{ t('hub.tabs.plugins') }}</TabsTrigger>
          <TabsTrigger value="HubUpdates">{{ t('hub.tabs.updates') }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div class="flex-1 min-h-0 overflow-y-hidden">
        <RouterView />
      </div>
    </template>
  </Page>
</template>

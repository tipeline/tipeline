<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { AppWindow } from 'lucide-vue-next';
import Page from '@/components/Page.vue';
import NotFoundState from '@/components/NotFoundState.vue';
import VersionsView from '@/components/versions/VersionsView.vue';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import { useAppStore } from '@/store/app';

// An app's saved versions (see VersionsView), opened from the app page's menu.
const route = useRoute();
const { t } = useI18n();
const identifier = route.params.aid as string;

const { data: app, isLoading, refetch } = useQuery(SEND.APP_DETAIL, { identifier });
const notFound = computed(() => !isLoading.value && !app.value);

// For the breadcrumb (Apps › name › Versions).
const appStore = useAppStore();
watch(app, (value) => value && appStore.setApp(value), { immediate: true });
</script>

<template>
  <Page>
    <template #title>{{ t('tasks.versions.title') }}</template>
    <template #content>
      <NotFoundState
        v-if="notFound"
        :title="t('apps.notFound.title')"
        :description="t('apps.notFound.description')"
        :back-label="t('apps.notFound.back')"
        :back-to="{ name: 'AppsList' }"
        :icon="AppWindow"
      />
      <VersionsView v-else-if="app" kind="app" :item="app" @updated="refetch({ identifier })" />
    </template>
  </Page>
</template>

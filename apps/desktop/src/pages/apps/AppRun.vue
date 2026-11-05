<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { AppWindow, TriangleAlert } from 'lucide-vue-next';
import type { AppSource } from '@tipeline/schemas';
import AppRunner from '@/components/app/AppRunner.vue';
import { useQuery } from '@/composables/useQuery';
import { useErrorT } from '@/composables/useErrorT';
import { SEND } from '@/ipc-channels';
import { toAssetUrl } from '@/utils/assetUrl';

// An app on its own, in a run-only window: its name, then the app (with its row of
// page tabs and "App", as on the app's page). No sidebar, no
// builder, no way to leave it — for the people who only use the app.
const route = useRoute();
const { t } = useI18n();
const { translateError } = useErrorT();
const identifier = route.params.aid as string;
const { data: result, isLoading } = useQuery<any>(SEND.APP_DETAIL, {
  identifier,
});

const source = shallowRef<AppSource | null>(null);
watch(
  () => result.value?.source as string | undefined,
  (text) => {
    try {
      source.value =
        text && !result.value?.source_error ? JSON.parse(text) : null;
    } catch {
      source.value = null;
    }
  },
  { immediate: true }
);
watch(
  () => result.value?.name,
  (name) => {
    if (name) document.title = name;
  },
  { immediate: true }
);

const imageUrl = computed(() => toAssetUrl(result.value?.metadata?.image));
const error = computed(() => {
  if (isLoading.value) return null;
  if (!result.value) return t('apps.notFound.title');
  return result.value.source_error
    ? translateError(result.value.source_error)
    : null;
});
</script>

<template>
  <!-- No line under the name: the app's own row of page tabs draws the line. -->
  <header class="flex items-center gap-2 px-4 h-12 shrink-0">
    <div
      class="size-6 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0"
    >
      <img v-if="imageUrl" :src="imageUrl" class="w-full h-full object-cover" />
      <AppWindow v-else class="size-3.5 text-muted-foreground/50" />
    </div>
    <span class="font-bold text-sm truncate">{{ result?.name }}</span>
  </header>
  <main class="flex-1 min-h-0 overflow-auto px-4 pb-4">
    <div
      v-if="error"
      class="flex flex-col items-center justify-center gap-2 h-full text-sm text-center"
    >
      <TriangleAlert class="size-6 text-destructive" />
      <pre
        class="text-xs text-muted-foreground whitespace-pre-wrap max-w-2xl m-0"
        >{{ error }}</pre
      >
    </div>
    <AppRunner
      v-else-if="source"
      :app-identifier="identifier"
      :source="source"
      show-app-bar
      :author="result?.author"
      :version="result?.version"
    />
  </main>
</template>

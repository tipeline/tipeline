<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSkeletonText,
  onIonViewWillEnter,
  onIonViewDidLeave,
} from '@ionic/vue';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';
import { prepareApps, setAppsOpen } from '@/apps/appSupport';

const props = defineProps<{ identifier: string }>();

// Desktop's own app runner and toasts, unchanged (see vite.config.ts and apps/desktopBridge.ts).
const AppRunner = defineAsyncComponent(() => import('@desktop/components/app/AppRunner.vue'));
// Desktop's toasts come from vue-sonner; on a phone they show at the top, under the header.
const Toaster = defineAsyncComponent(async () => {
  await import('vue-sonner/style.css');
  return (await import('vue-sonner')).Toaster;
});

// Below the header (vue-sonner uses `mobileOffset` on narrow screens).
const toastOffset = { top: 'calc(env(safe-area-inset-top) + 64px)', left: '12px', right: '12px' };

const { t } = useI18n();
const session = useSession();

const name = ref('');
const source = shallowRef<unknown>(null);
const loaded = ref(false);
const error = ref('');

async function load() {
  error.value = '';
  try {
    await prepareApps();
    const detail = await session.api().request<any>('appDetail', { identifier: props.identifier });
    if (!detail) throw new Error(t('appsTab.notFound'));
    name.value = detail.name ?? '';
    if (detail.source_error) throw new Error(t('appsTab.brokenSource', { message: detail.source_error }));
    source.value = typeof detail.source === 'string' ? JSON.parse(detail.source) : detail.source;
  } catch (err) {
    error.value = (err as Error).message || t('appsTab.notFound');
  } finally {
    loaded.value = true;
  }
}
onMounted(load);

onIonViewWillEnter(() => setAppsOpen(true));
onIonViewDidLeave(() => setAppsOpen(false));
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/apps" />
        </ion-buttons>
        <ion-title>{{ name }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="app-content">
      <div v-if="!loaded" class="ion-padding" aria-busy="true">
        <ion-skeleton-text animated style="width: 60%; height: 22px" />
        <ion-skeleton-text v-for="n in 3" :key="n" animated style="width: 100%; height: 120px; margin-top: 12px; border-radius: 12px" />
      </div>
      <p v-else-if="error" class="ion-padding tl-error" role="alert">{{ error }}</p>
      <div v-else-if="source" class="app-area" data-app-fill-area>
        <!-- No "App · by … · v…" row: the header already names the app, and the page tabs
             need the whole width of a phone. -->
        <app-runner :app-identifier="identifier" :source="source" />
      </div>
    </ion-content>
    <!-- Outside the content, which has its own positioning box: under the page's header. -->
    <toaster
      rich-colors
      position="top-center"
      :duration="6000"
      :offset="toastOffset"
      :mobile-offset="toastOffset"
    />
  </ion-page>
</template>

<style scoped>
.app-area {
  padding: 8px 12px max(16px, env(safe-area-inset-bottom));
  color: var(--foreground);
  font-size: 14px;
}
</style>

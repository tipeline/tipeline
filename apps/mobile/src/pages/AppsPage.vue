<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonThumbnail,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonButton,
} from '@ionic/vue';
import { appsOutline } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';
import { descriptionLine } from '@/lib/workflows';
import { appImageUrl } from '@/apps/appImage';

interface AppRow {
  identifier: string;
  name: string;
  description?: string | null;
  image?: string | null;
}

const { t } = useI18n();
const session = useSession();
const ios = document.documentElement.getAttribute('mode') === 'ios';

const apps = ref<AppRow[]>([]);
const loaded = ref(false);
const error = ref('');
const query = ref('');

async function load() {
  error.value = '';
  try {
    const rows = await session.api().request<AppRow[]>('appList');
    apps.value = (rows ?? []).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loaded.value = true;
  }
}
async function refresh(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}
onMounted(load);
watch(
  () => session.status,
  (status, before) => {
    if (status === 'open' && before && before !== 'open' && (error.value || !loaded.value)) load();
  }
);

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return apps.value;
  return apps.value.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
});
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('appsTab.title') }}</ion-title>
      </ion-toolbar>
      <ion-toolbar v-if="!ios">
        <ion-searchbar v-model="query" :placeholder="t('appsTab.search')" :debounce="100" />
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content>
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('appsTab.title') }}</ion-title>
        </ion-toolbar>
        <ion-toolbar>
          <ion-searchbar v-model="query" :placeholder="t('appsTab.search')" :debounce="100" />
        </ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" class="ion-padding" aria-busy="true">
        <ion-skeleton-text v-for="n in 5" :key="n" animated style="width: 100%; height: 56px; margin-bottom: 8px" />
      </div>
      <div v-else-if="error" class="ion-padding">
        <p class="tl-error" role="alert">{{ t('appsTab.loadFailed', { message: error }) }}</p>
        <ion-button fill="outline" @click="load">{{ t('appsTab.tryAgain') }}</ion-button>
      </div>
      <p v-else-if="apps.length === 0" class="ion-padding tl-muted">{{ t('appsTab.empty') }}</p>
      <p v-else-if="shown.length === 0" class="ion-padding tl-muted">{{ t('appsTab.noMatch', { query }) }}</p>

      <ion-list v-else lines="full" class="list">
        <ion-item v-for="a in shown" :key="a.identifier" :router-link="`/tabs/apps/${encodeURIComponent(a.identifier)}`" detail>
          <ion-thumbnail slot="start" class="thumb">
            <img v-if="appImageUrl(a.image)" :src="appImageUrl(a.image)!" alt="" />
            <ion-icon v-else :icon="appsOutline" aria-hidden="true" />
          </ion-thumbnail>
          <ion-label class="ion-text-wrap">
            <h2>{{ a.name }}</h2>
            <p v-if="descriptionLine(a.description)">{{ descriptionLine(a.description) }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.list h2 {
  font-size: 16px;
  font-weight: 600;
}
.list p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.thumb {
  --size: 40px;
  --border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tl-bg);
  border-radius: 10px;
  color: var(--tl-muted);
  font-size: 20px;
}
</style>

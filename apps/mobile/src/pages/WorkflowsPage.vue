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
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonButton,
} from '@ionic/vue';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';
import { descriptionLine, isListed } from '@/lib/workflows';

interface WorkflowRow {
  identifier: string;
  name: string;
  description?: string | null;
  helper?: unknown;
}

const { t } = useI18n();
const session = useSession();

// Ionic picks iOS or Material styling per device and marks it on <html>.
const ios = document.documentElement.getAttribute('mode') === 'ios';

const workflows = ref<WorkflowRow[]>([]);
const loaded = ref(false);
const error = ref('');
const query = ref('');

async function load() {
  error.value = '';
  try {
    const rows = await session.api().request<WorkflowRow[]>('taskList');
    workflows.value = (rows ?? []).filter(isListed).sort((a, b) => a.name.localeCompare(b.name));
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
// After a reconnect the list may be out of date (or never loaded while offline).
watch(
  () => session.status,
  (status, before) => {
    if (status === 'open' && before && before !== 'open' && (error.value || !loaded.value)) load();
  }
);

const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return workflows.value;
  return workflows.value.filter(
    (w) => w.name.toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q)
  );
});
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('workflows.title') }}</ion-title>
      </ion-toolbar>
      <!-- Android has no large-title header, so its search box sits here. -->
      <ion-toolbar v-if="!ios">
        <ion-searchbar v-model="query" :placeholder="t('workflows.search')" :debounce="100" />
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content>
      <!-- iOS only: the large title, with the search box under it. -->
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">{{ t('workflows.title') }}</ion-title>
        </ion-toolbar>
        <ion-toolbar>
          <ion-searchbar v-model="query" :placeholder="t('workflows.search')" :debounce="100" />
        </ion-toolbar>
      </ion-header>

      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" class="ion-padding" aria-busy="true">
        <div v-for="n in 6" :key="n" class="skeleton-row">
          <ion-skeleton-text animated style="width: 55%" />
          <ion-skeleton-text animated style="width: 85%" />
        </div>
      </div>

      <div v-else-if="error" class="ion-padding">
        <p class="tl-error" role="alert">{{ t('workflows.loadFailed', { message: error }) }}</p>
        <ion-button fill="outline" @click="load">{{ t('workflows.tryAgain') }}</ion-button>
      </div>

      <p v-else-if="workflows.length === 0" class="ion-padding tl-muted">{{ t('workflows.empty') }}</p>
      <p v-else-if="shown.length === 0" class="ion-padding tl-muted">{{ t('workflows.noMatch', { query }) }}</p>

      <ion-list v-else lines="full" class="list">
        <ion-item
          v-for="w in shown"
          :key="w.identifier"
          :router-link="`/tabs/workflows/${encodeURIComponent(w.identifier)}`"
          detail
        >
          <ion-label class="ion-text-wrap">
            <h2>{{ w.name }}</h2>
            <p v-if="descriptionLine(w.description)">{{ descriptionLine(w.description) }}</p>
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
.skeleton-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--tl-border);
}
</style>

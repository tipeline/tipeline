<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSkeletonText,
  IonButton,
  IonButtons,
  IonBackButton,
  onIonViewDidEnter,
  onIonViewDidLeave,
} from '@ionic/vue';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import RunStatusPill from '@/components/RunStatusPill.vue';
import { useSession } from '@/session';
import { durationText } from '@/lib/assistant';
import { RUN_FILTERS, isActive, relativeTime, runDurationMs, statusFilter, type RunFilter, type RunRow } from '@/lib/runs';

const PAGE = 30;
/** Runs other people start don't stream to this phone: the list re-reads itself while shown. */
const POLL_MS = 15_000;
const LIST_CHANGES = new Set(['onTaskStart', 'onTaskEnd', 'onTaskEndAll', 'onTaskError', 'onPipelineCancel', 'onApprovalDecide']);

const { t, locale } = useI18n();
const session = useSession();

// Home's tiles open this list already filtered (?filter=failed).
const route = useRoute();
const asked = String(route.query.filter ?? '');
const filter = ref<RunFilter>((RUN_FILTERS as readonly string[]).includes(asked) ? (asked as RunFilter) : 'all');
const runs = ref<RunRow[]>([]);
const loaded = ref(false);
const error = ref('');
const more = ref(true);
const now = ref(Date.now());

async function fetchPage(offset: number, limit: number): Promise<RunRow[]> {
  return (
    (await session.api().request<RunRow[]>('pipelineList', {
      limit,
      offset,
      status: statusFilter(filter.value),
    })) ?? []
  );
}

/** The first page again, as long as what is already shown (so scrolling back up stays put). */
let reloading: Promise<void> | null = null;
function reload(): Promise<void> {
  reloading ??= (async () => {
    const wanted = filter.value;
    try {
      const limit = Math.max(PAGE, runs.value.length);
      const rows = await fetchPage(0, limit);
      if (wanted !== filter.value) return;
      runs.value = rows;
      more.value = rows.length === limit;
      error.value = '';
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loaded.value = true;
      now.value = Date.now();
    }
  })().finally(() => (reloading = null));
  return reloading;
}

async function loadMore(ev: CustomEvent) {
  try {
    const rows = await fetchPage(runs.value.length, PAGE);
    const known = new Set(runs.value.map((r) => r.identifier));
    runs.value = [...runs.value, ...rows.filter((r) => !known.has(r.identifier))];
    more.value = rows.length === PAGE;
  } catch {
    // The next scroll tries again.
  } finally {
    (ev.target as HTMLIonInfiniteScrollElement).complete();
  }
}

async function refresh(ev: CustomEvent) {
  await reload();
  (ev.target as HTMLIonRefresherElement).complete();
}

watch(filter, () => {
  runs.value = [];
  loaded.value = false;
  more.value = true;
  void reload();
});

let timer: ReturnType<typeof setInterval> | null = null;
let stopMessages: (() => void) | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;
onIonViewDidEnter(() => {
  void reload();
  timer = setInterval(() => void reload(), POLL_MS);
  stopMessages =
    session.client?.subscribe((message) => {
      if (!LIST_CHANGES.has(message.event)) return;
      if (soon) clearTimeout(soon);
      soon = setTimeout(() => void reload(), 400);
    }) ?? null;
});
onIonViewDidLeave(() => {
  if (timer) clearInterval(timer);
  if (soon) clearTimeout(soon);
  stopMessages?.();
  timer = soon = stopMessages = null;
});
watch(
  () => session.status,
  (status, before) => {
    if (status === 'open' && before && before !== 'open') void reload();
  }
);

const emptyText = computed(() => (filter.value === 'all' ? t('runs.empty') : t('runs.emptyFiltered')));

function meta(run: RunRow): string {
  const when = relativeTime(run.started_at, locale.value, now.value);
  const took = durationText(runDurationMs(run, now.value));
  if (!took) return when;
  return isActive(run.status) ? when : `${when} · ${took}`;
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/home" />
        </ion-buttons>
        <ion-title>{{ t('runs.title') }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="filter" scrollable :aria-label="t('runs.title')">
          <ion-segment-button v-for="f in RUN_FILTERS" :key="f" :value="f">
            <ion-label>{{ t(`runs.filters.${f}`) }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" class="ion-padding" aria-busy="true">
        <div v-for="n in 6" :key="n" class="skeleton-row">
          <ion-skeleton-text animated style="width: 50%" />
          <ion-skeleton-text animated style="width: 30%" />
        </div>
      </div>

      <div v-else-if="error && runs.length === 0" class="ion-padding">
        <p class="tl-error" role="alert">{{ t('runs.loadFailed', { message: error }) }}</p>
        <ion-button fill="outline" @click="reload">{{ t('runs.tryAgain') }}</ion-button>
      </div>

      <p v-else-if="runs.length === 0" class="ion-padding tl-muted">{{ emptyText }}</p>

      <template v-else>
        <ion-list lines="full" class="list">
          <ion-item
            v-for="run in runs"
            :key="run.identifier"
            :router-link="`/tabs/home/runs/${encodeURIComponent(run.identifier)}`"
            detail
          >
            <ion-label class="ion-text-wrap">
              <h2>{{ run.task_name }}</h2>
              <p>{{ meta(run) }}</p>
            </ion-label>
            <run-status-pill slot="end" :status="run.status" />
          </ion-item>
        </ion-list>
        <ion-infinite-scroll :disabled="!more" @ion-infinite="loadMore">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </template>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.list h2 {
  font-size: 16px;
  font-weight: 600;
}
.list p {
  font-size: 13px;
}
.skeleton-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--tl-border);
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonContent,
  IonIcon,
  IonButton,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  onIonViewDidEnter,
  onIonViewDidLeave,
} from '@ionic/vue';
import { chatbubbleOutline, play, timeOutline, chevronForward } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import { useSession } from '@/session';
import { useApprovals } from '@/approvalsStore';
import { useInbox } from '@/inboxStore';
import { useStars } from '@/starsStore';
import { relativeTime } from '@/lib/runs';
import { formatDateTime, nextUp } from '@/lib/schedules';

const { t, locale } = useI18n();
const session = useSession();
const approvals = useApprovals();
const inbox = useInbox();
const stars = useStars();

const now = ref(new Date());
const dateLine = computed(() =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'long', day: 'numeric', month: 'long' }).format(now.value)
);
const initials = computed(() => {
  const name = session.user?.name?.trim() || session.user?.email || '';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
});
const canAsk = computed(() => session.user?.role !== 'viewer');

// Today's runs, by the phone's own midnight (the Server counts any span it's given).
const stats = ref<{ total: number; failed: number } | null>(null);
async function loadStats() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  try {
    const [today] = await session
      .api()
      .request<Array<{ total: number; failed: number }>>('pipelineStats', { boundaries: [start.toISOString(), end.toISOString()] });
    stats.value = today ?? { total: 0, failed: 0 };
  } catch {
    // The tiles show a dash until the next try.
  }
}

const waiting = computed(() => approvals.items.filter((i) => i.canDecide !== false));
const first = computed(() => waiting.value[0] ?? null);
const approveError = ref('');
async function approveFirst() {
  if (!first.value) return;
  approveError.value = '';
  try {
    await approvals.decide(first.value, true, '');
  } catch (err) {
    approveError.value = t('home.approveFailed', { message: (err as Error).message });
  }
}

const starred = computed(() =>
  stars.starred
    .map((id) => inbox.workflows.find((w) => w.identifier === id))
    .filter((w): w is NonNullable<typeof w> => !!w)
);
function lastRunLine(w: (typeof starred.value)[number]): string {
  if (!w.last_run_at) return t('home.notRunYet');
  const status = w.last_run_status ? ` · ${t(`runs.status.${w.last_run_status}`)}` : '';
  return t('home.lastRun', { when: relativeTime(w.last_run_at, locale.value) }) + status;
}

const next = computed(() => nextUp(inbox.schedules));

async function refreshAll() {
  now.value = new Date();
  await Promise.all([loadStats(), inbox.refresh()]);
}
async function refresh(ev: CustomEvent) {
  await refreshAll();
  (ev.target as HTMLIonRefresherElement).complete();
}

let stopMessages: (() => void) | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;
onIonViewDidEnter(() => {
  void refreshAll();
  stopMessages =
    session.client?.subscribe((message) => {
      if (!['onTaskStart', 'onTaskEnd', 'onTaskEndAll', 'onTaskError'].includes(message.event)) return;
      if (soon) clearTimeout(soon);
      soon = setTimeout(() => void loadStats(), 500);
    }) ?? null;
});
function stop() {
  if (soon) clearTimeout(soon);
  stopMessages?.();
  soon = stopMessages = null;
}
onIonViewDidLeave(stop);
onBeforeUnmount(stop);
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="bare" />
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="top">
        <div>
          <div class="tl-muted date">{{ dateLine }}</div>
          <h1>{{ t('home.title') }}</h1>
        </div>
        <router-link to="/tabs/home/more" class="avatar" :aria-label="t('home.accountLabel')">{{ initials }}</router-link>
      </div>

      <router-link v-if="canAsk" to="/tabs/assistant" class="ask">
        <ion-icon :icon="chatbubbleOutline" aria-hidden="true" />
        <span>{{ t('home.ask') }}</span>
      </router-link>

      <div class="tiles">
        <router-link to="/tabs/home/runs" class="tile">
          <span class="label">{{ t('home.runsToday') }}</span>
          <span class="count">{{ stats ? stats.total : '–' }}</span>
        </router-link>
        <router-link to="/tabs/home/runs?filter=failed" class="tile failed">
          <span class="label">{{ t('home.failedToday') }}</span>
          <span class="count">{{ stats ? stats.failed : '–' }}</span>
        </router-link>
        <router-link to="/tabs/inbox" class="tile waiting">
          <span class="label">{{ t('home.forYou') }}</span>
          <span class="count">{{ inbox.loaded ? inbox.count : '–' }}</span>
        </router-link>
      </div>

      <section v-if="first" class="tl-card waiting-card">
        <div class="head">
          <h2>{{ t('home.waitingForYou') }}</h2>
          <router-link to="/tabs/inbox">{{ t('home.seeAll') }}</router-link>
        </div>
        <div>
          <div class="request">{{ first.title || first.workflowName }}</div>
          <div class="tl-muted line">
            <template v-if="first.title">{{ first.workflowName }} · </template>{{ relativeTime(first.requestedAt, locale) }}
          </div>
        </div>
        <p v-if="approveError" class="tl-error" role="alert">{{ approveError }}</p>
        <div class="buttons">
          <ion-button fill="outline" router-link="/tabs/inbox">{{ t('home.review') }}</ion-button>
          <ion-button :disabled="approvals.deciding === first.pipelineIdentifier" @click="approveFirst">
            <ion-spinner v-if="approvals.deciding === first.pipelineIdentifier" name="crescent" aria-hidden="true" />
            {{ t('home.approve') }}
          </ion-button>
        </div>
      </section>

      <section class="starred">
        <div class="head">
          <h2>{{ t('home.starred') }}</h2>
          <router-link to="/tabs/workflows">{{ t('home.allWorkflows') }}</router-link>
        </div>
        <p v-if="starred.length === 0" class="tl-muted empty">{{ t('home.noStarred') }}</p>
        <div v-else class="tl-card list">
          <div v-for="w in starred" :key="w.identifier" class="row">
            <router-link :to="`/tabs/workflows/${encodeURIComponent(w.identifier)}`" class="name">
              <strong>{{ w.name }}</strong>
              <span class="tl-muted">{{ lastRunLine(w) }}</span>
            </router-link>
            <router-link
              :to="`/tabs/workflows/${encodeURIComponent(w.identifier)}`"
              class="run"
              :aria-label="t('home.runWorkflow', { name: w.name })"
            >
              <ion-icon :icon="play" aria-hidden="true" />
            </router-link>
          </div>
        </div>
      </section>

      <router-link v-if="next" to="/tabs/home/schedules" class="next tl-muted">
        <ion-icon :icon="timeOutline" aria-hidden="true" />
        <span>
          {{ t('home.nextUp') }} <strong>{{ next.taskName }}</strong> · {{ formatDateTime(next.nextRunAt, locale) }}
        </span>
        <ion-icon :icon="chevronForward" aria-hidden="true" />
      </router-link>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.bare {
  --min-height: 0;
}
a {
  color: inherit;
  text-decoration: none;
}
.top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 8px;
}
.date {
  font-size: 13px;
  font-weight: 500;
}
h1 {
  margin: 2px 0 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: var(--tl-ink);
  color: var(--tl-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}
.ask {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  height: 52px;
  padding: 0 14px;
  background: var(--tl-card);
  border: 1px solid var(--tl-border);
  border-radius: 14px;
  color: var(--tl-muted);
  font-size: 15px;
}
.ask ion-icon {
  font-size: 20px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--tl-card);
  border: 1px solid var(--tl-border);
  border-radius: 14px;
}
.tile .label {
  font-size: 12px;
  font-weight: 500;
  color: var(--tl-muted);
}
.tile .count {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.tile.failed {
  background: var(--tl-failed-bg);
  border-color: transparent;
}
.tile.failed .label,
.tile.failed .count {
  color: var(--tl-failed-ink);
}
.tile.waiting {
  background: var(--tl-waiting-bg);
  border-color: transparent;
}
.tile.waiting .label,
.tile.waiting .count {
  color: var(--tl-waiting-ink);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.head a {
  font-size: 13px;
  font-weight: 600;
  color: var(--tl-accent);
}
.waiting-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}
.request {
  font-size: 15px;
  font-weight: 600;
}
.line {
  font-size: 13px;
}
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.buttons ion-button {
  --border-radius: 10px;
  margin: 0;
  font-weight: 600;
}
.buttons ion-spinner {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}
.starred {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.starred .head {
  padding: 0 2px;
}
.empty {
  margin: 0;
  font-size: 14px;
}
.list {
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--tl-border);
}
.row:last-child {
  border-bottom: 0;
}
.name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name strong {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name span {
  font-size: 13px;
}
.run {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: var(--tl-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.next {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 0 2px;
  font-size: 13px;
}
.next span {
  flex: 1;
}
.next strong {
  color: var(--tl-ink);
  font-weight: 600;
}
</style>

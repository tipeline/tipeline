<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonButton,
  IonIcon,
  onIonViewDidEnter,
} from '@ionic/vue';
import { alertCircle, checkmarkCircle, closeCircle, informationCircle, timeOutline, warning } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import ApprovalCard from '@/components/ApprovalCard.vue';
import { useApprovals, type ApprovalDecision, type PendingApproval } from '@/approvalsStore';
import { useInbox } from '@/inboxStore';
import { confirmAction } from '@/lib/confirm';
import { relativeTime } from '@/lib/runs';
import type { AlertItem } from '@/lib/inbox';

const { t, locale } = useI18n();
const approvals = useApprovals();
const inbox = useInbox();

const tab = ref<'needsYou' | 'decided'>('needsYou');
const errors = ref<Record<string, string>>({});
const alertError = ref('');

const loaded = computed(() => approvals.loaded && inbox.loaded);
const nothing = computed(
  () => approvals.items.length + inbox.alerts.length + inbox.failing.length + inbox.missed.length === 0
);
const loadError = computed(() => approvals.error || inbox.error);

const decided = ref<ApprovalDecision[]>([]);
const decidedLoaded = ref(false);
const decidedError = ref('');
async function loadDecided() {
  try {
    decided.value = await approvals.history();
    decidedError.value = '';
  } catch (err) {
    decidedError.value = (err as Error).message;
  } finally {
    decidedLoaded.value = true;
  }
}

onIonViewDidEnter(() => {
  void inbox.refresh();
  if (tab.value === 'decided') void loadDecided();
});
watch(tab, (value) => {
  if (value === 'decided') void loadDecided();
});

async function refresh(ev: CustomEvent) {
  await (tab.value === 'needsYou' ? inbox.refresh() : loadDecided());
  (ev.target as HTMLIonRefresherElement).complete();
}

async function decide(item: PendingApproval, approved: boolean, comment: string) {
  if (!approved) {
    const sure = await confirmAction({
      header: t('approvals.rejectTitle'),
      message: t('approvals.rejectBody'),
      confirm: t('approvals.reject'),
      cancel: t('approvals.notNow'),
      destructive: true,
    });
    if (!sure) return;
  }
  errors.value = { ...errors.value, [item.pipelineIdentifier]: '' };
  try {
    await approvals.decide(item, approved, comment);
  } catch (err) {
    errors.value = { ...errors.value, [item.pipelineIdentifier]: t('approvals.decideFailed', { message: (err as Error).message }) };
  }
}

async function dismissAlert(alert: AlertItem) {
  alertError.value = '';
  try {
    await inbox.dismissAlert(alert);
  } catch (err) {
    alertError.value = t('inbox.dismissFailed', { message: (err as Error).message });
  }
}

const levelIcon = (level: string) => (level === 'critical' ? alertCircle : level === 'warning' ? warning : informationCircle);
function alertLine(a: AlertItem): string {
  const when = relativeTime(a.lastRaisedAt, locale.value);
  return a.count > 1 ? t('inbox.raisedTimes', { count: a.count, when }) : t('inbox.raised', { when });
}

function decisionLine(d: ApprovalDecision): string {
  if (!d.decidedBy) return t(d.approved ? 'approvals.approvedAuto' : 'approvals.rejectedAuto');
  return t(d.approved ? 'approvals.approvedBy' : 'approvals.rejectedBy', { who: d.decidedBy });
}
const runLink = (pipelineIdentifier: string) => `/tabs/home/runs/${encodeURIComponent(pipelineIdentifier)}`;
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('inbox.title') }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="tab" :aria-label="t('inbox.title')">
          <ion-segment-button value="needsYou">
            <ion-label>{{ t('inbox.tabs.needsYou') }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="decided">
            <ion-label>{{ t('inbox.tabs.decided') }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <template v-if="tab === 'needsYou'">
        <div v-if="!loaded" aria-busy="true">
          <ion-skeleton-text v-for="n in 3" :key="n" animated style="width: 100%; height: 120px; border-radius: 16px" />
        </div>
        <template v-else>
          <p v-if="loadError" class="tl-error" role="alert">{{ t('inbox.loadFailed', { message: loadError }) }}</p>
          <p v-if="nothing && !loadError" class="tl-muted">{{ t('inbox.empty') }}</p>

          <template v-if="approvals.items.length">
            <h2 class="tl-section-title">{{ t('inbox.approvals') }}</h2>
            <approval-card
              v-for="item in approvals.items"
              :key="item.pipelineIdentifier"
              :item="item"
              :deciding="approvals.deciding === item.pipelineIdentifier"
              :disabled="!!approvals.deciding && approvals.deciding !== item.pipelineIdentifier"
              :error="errors[item.pipelineIdentifier]"
              @decide="(approved, comment) => decide(item, approved, comment)"
            />
          </template>

          <template v-if="inbox.alerts.length">
            <h2 class="tl-section-title">{{ t('inbox.alerts') }}</h2>
            <p v-if="alertError" class="tl-error" role="alert">{{ alertError }}</p>
            <article v-for="a in inbox.alerts" :key="a.id" class="tl-card item" :class="`level-${a.level}`">
              <ion-icon :icon="levelIcon(a.level)" class="lead" :aria-label="t(`inbox.levels.${a.level}`, a.level)" />
              <div class="body">
                <strong>{{ a.title }}</strong>
                <span class="tl-muted">{{ a.workflowName }} · {{ alertLine(a) }}</span>
                <p v-if="a.message" class="message">{{ a.message }}</p>
                <div class="actions">
                  <ion-button fill="clear" size="small" @click="dismissAlert(a)">{{ t('inbox.dismiss') }}</ion-button>
                  <ion-button v-if="a.pipelineIdentifier" fill="clear" size="small" :router-link="runLink(a.pipelineIdentifier)">
                    {{ t('inbox.viewRun') }}
                  </ion-button>
                </div>
              </div>
            </article>
          </template>

          <template v-if="inbox.failing.length">
            <h2 class="tl-section-title">{{ t('inbox.failed') }}</h2>
            <article v-for="w in inbox.failing" :key="w.identifier" class="tl-card item level-critical">
              <ion-icon :icon="closeCircle" class="lead" aria-hidden="true" />
              <div class="body">
                <strong>{{ w.name }}</strong>
                <span class="tl-muted">{{ t('inbox.failedAt', { when: relativeTime(w.last_run_at, locale) }) }}</span>
                <div class="actions">
                  <ion-button fill="clear" size="small" @click="inbox.dismissFailure(w)">{{ t('inbox.dismiss') }}</ion-button>
                  <ion-button v-if="w.last_run_identifier" fill="clear" size="small" :router-link="runLink(w.last_run_identifier)">
                    {{ t('inbox.viewRun') }}
                  </ion-button>
                </div>
              </div>
            </article>
          </template>

          <template v-if="inbox.missed.length">
            <h2 class="tl-section-title">{{ t('inbox.missed') }}</h2>
            <article v-for="s in inbox.missed" :key="s.scheduleIdentifier" class="tl-card item level-warning">
              <ion-icon :icon="timeOutline" class="lead" aria-hidden="true" />
              <div class="body">
                <strong>{{ s.taskName }}</strong>
                <span class="tl-muted">{{ t('inbox.missedAt', { when: relativeTime(s.missedAt, locale) }) }}</span>
                <div class="actions">
                  <ion-button fill="clear" size="small" @click="inbox.dismissMissed(s)">{{ t('inbox.dismiss') }}</ion-button>
                  <ion-button fill="clear" size="small" :router-link="`/tabs/workflows/${encodeURIComponent(s.taskIdentifier)}`">
                    {{ t('inbox.openWorkflow') }}
                  </ion-button>
                </div>
              </div>
            </article>
          </template>
        </template>
      </template>

      <template v-else>
        <div v-if="!decidedLoaded" aria-busy="true">
          <ion-skeleton-text v-for="n in 4" :key="n" animated style="width: 100%; height: 72px; border-radius: 16px" />
        </div>
        <div v-else-if="decidedError && decided.length === 0">
          <p class="tl-error" role="alert">{{ t('approvals.loadFailed', { message: decidedError }) }}</p>
          <ion-button fill="outline" @click="loadDecided">{{ t('runs.tryAgain') }}</ion-button>
        </div>
        <p v-else-if="decided.length === 0" class="tl-muted">{{ t('approvals.emptyDecided') }}</p>
        <router-link
          v-for="d in decided"
          v-else
          :key="`${d.pipelineIdentifier}:${d.key}`"
          :to="runLink(d.pipelineIdentifier)"
          class="tl-card decision"
        >
          <ion-icon
            :icon="d.approved ? checkmarkCircle : closeCircle"
            :class="d.approved ? 'approved' : 'rejected'"
            aria-hidden="true"
          />
          <div>
            <strong>{{ d.title || d.workflowName }}</strong>
            <span class="tl-muted">
              {{ decisionLine(d) }}<template v-if="d.decidedAt"> · {{ relativeTime(d.decidedAt, locale) }}</template>
            </span>
            <q v-if="d.comment">{{ d.comment }}</q>
          </div>
        </router-link>
      </template>
    </ion-content>
  </ion-page>
</template>

<style scoped>
ion-skeleton-text {
  margin-bottom: 12px;
}
.tl-section-title:first-of-type {
  margin-top: 4px;
}
.item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
  padding-bottom: 6px;
}
.lead {
  flex: none;
  font-size: 22px;
  color: var(--tl-muted);
}
.level-critical .lead {
  color: var(--tl-failed-ink);
}
.level-warning .lead {
  color: var(--tl-waiting-ink);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.body strong {
  font-size: 15px;
}
.body span {
  font-size: 13px;
}
.message {
  margin: 4px 0 0;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.actions {
  display: flex;
  gap: 4px;
  margin-left: -10px;
}
.actions ion-button {
  margin: 0;
}
.decision {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
  color: inherit;
  text-decoration: none;
}
.decision ion-icon {
  flex: none;
  font-size: 22px;
}
.decision ion-icon.approved {
  color: var(--tl-success-ink);
}
.decision ion-icon.rejected {
  color: var(--tl-failed-ink);
}
.decision div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.decision span {
  font-size: 13px;
}
.decision q {
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

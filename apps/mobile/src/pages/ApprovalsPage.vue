<script setup lang="ts">
import { ref, watch } from 'vue';
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
import { checkmarkCircle, closeCircle } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import ApprovalCard from '@/components/ApprovalCard.vue';
import { useApprovals, type ApprovalDecision, type PendingApproval } from '@/approvalsStore';
import { confirmAction } from '@/lib/confirm';
import { relativeTime } from '@/lib/runs';

const { t, locale } = useI18n();
const approvals = useApprovals();

const tab = ref<'waiting' | 'decided'>('waiting');
const errors = ref<Record<string, string>>({});

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
  void approvals.refresh();
  if (tab.value === 'decided') void loadDecided();
});
watch(tab, (value) => {
  if (value === 'decided') void loadDecided();
});

async function refresh(ev: CustomEvent) {
  await (tab.value === 'waiting' ? approvals.refresh() : loadDecided());
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

function decisionLine(d: ApprovalDecision): string {
  if (!d.decidedBy) return t(d.approved ? 'approvals.approvedAuto' : 'approvals.rejectedAuto');
  return t(d.approved ? 'approvals.approvedBy' : 'approvals.rejectedBy', { who: d.decidedBy });
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('approvals.title') }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="tab" :aria-label="t('approvals.title')">
          <ion-segment-button value="waiting">
            <ion-label>{{ t('approvals.tabs.waiting') }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="decided">
            <ion-label>{{ t('approvals.tabs.decided') }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <template v-if="tab === 'waiting'">
        <div v-if="!approvals.loaded" aria-busy="true">
          <ion-skeleton-text v-for="n in 3" :key="n" animated style="width: 100%; height: 140px; border-radius: 16px" />
        </div>
        <div v-else-if="approvals.error && approvals.items.length === 0">
          <p class="tl-error" role="alert">{{ t('approvals.loadFailed', { message: approvals.error }) }}</p>
          <ion-button fill="outline" @click="approvals.refresh()">{{ t('runs.tryAgain') }}</ion-button>
        </div>
        <p v-else-if="approvals.items.length === 0" class="tl-muted">{{ t('approvals.empty') }}</p>
        <approval-card
          v-for="item in approvals.items"
          v-else
          :key="item.pipelineIdentifier"
          :item="item"
          :deciding="approvals.deciding === item.pipelineIdentifier"
          :disabled="!!approvals.deciding && approvals.deciding !== item.pipelineIdentifier"
          :error="errors[item.pipelineIdentifier]"
          @decide="(approved, comment) => decide(item, approved, comment)"
        />
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
          :to="`/tabs/runs/${encodeURIComponent(d.pipelineIdentifier)}`"
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

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonSkeletonText,
  IonFooter,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue';
import { checkmarkCircle, closeCircle, ellipseOutline, removeCircleOutline, pauseCircle, timeOutline } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import RunStatusPill from '@/components/RunStatusPill.vue';
import { useSession } from '@/session';
import { durationText } from '@/lib/assistant';
import { formatValue } from '@/lib/runProgress';
import { confirmAction } from '@/lib/confirm';
import {
  endMessage,
  isActive,
  pendingApproval,
  relativeTime,
  runDurationMs,
  runOutputs,
  runSteps,
  type RunDetail,
  type RunStepState,
} from '@/lib/runs';

const props = defineProps<{ pipelineIdentifier: string }>();

/** A run someone else started doesn't stream here: while it goes on, it is re-read. */
const FOLLOW_MS = 2_000;

const { t, locale } = useI18n();
const session = useSession();

const run = ref<RunDetail | null>(null);
const loaded = ref(false);
const loadError = ref('');
const canceling = ref(false);
const cancelError = ref('');
const now = ref(Date.now());

const active = computed(() => !!run.value && isActive(run.value.status));
const steps = computed(() => (run.value ? runSteps(run.value) : []));
const outputs = computed(() => (run.value?.status === 'completed' ? runOutputs(run.value) : []));
const approval = computed(() => (run.value ? pendingApproval(run.value) : null));
const ended = computed(() => (run.value ? endMessage(run.value) : ''));
// Viewers may read runs but not cancel them (the Server refuses too).
const canCancel = computed(() => active.value && session.user?.role !== 'viewer');

const meta = computed(() => {
  if (!run.value) return '';
  const parts = [t('run.started', { when: relativeTime(run.value.started_at, locale.value, now.value) })];
  const took = durationText(runDurationMs(run.value, now.value));
  if (took) parts.push(t(active.value ? 'run.runningFor' : 'run.took', { duration: took }));
  return parts.join(' · ');
});

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
async function load() {
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    const detail = await session.api().request<RunDetail | null>('pipelineDetail', {
      pipelineIdentifier: props.pipelineIdentifier,
    });
    if (!detail) throw new Error(t('run.notFound'));
    run.value = detail;
    loadError.value = '';
  } catch (err) {
    // Keep showing what was there; only a first load failing replaces the page.
    if (!run.value) loadError.value = (err as Error).message || t('run.notFound');
  } finally {
    loaded.value = true;
    now.value = Date.now();
    if (!stopped && run.value && isActive(run.value.status)) timer = setTimeout(load, FOLLOW_MS);
  }
}

let stopMessages: (() => void) | null = null;
onMounted(() => {
  void load();
  // A run ending is often broadcast (approvals, cancels, schedules): read it at once.
  stopMessages =
    session.client?.subscribe((message) => {
      if (message.data?.pipelineIdentifier === props.pipelineIdentifier) void load();
    }) ?? null;
});
onBeforeUnmount(() => {
  stopped = true;
  if (timer) clearTimeout(timer);
  stopMessages?.();
});

async function refresh(ev: CustomEvent) {
  await load();
  (ev.target as HTMLIonRefresherElement).complete();
}

async function cancel() {
  const sure = await confirmAction({
    header: t('run.cancelTitle'),
    message: t('run.cancelBody'),
    confirm: t('run.cancel'),
    cancel: t('run.keepRunning'),
    destructive: true,
  });
  if (!sure) return;
  canceling.value = true;
  cancelError.value = '';
  try {
    await session.api().request('pipelineCancel', { pipelineIdentifier: props.pipelineIdentifier });
    await load();
  } catch (err) {
    cancelError.value = t('run.cancelFailed', { message: (err as Error).message });
  } finally {
    canceling.value = false;
  }
}

const STEP_ICONS: Record<RunStepState, string> = {
  done: checkmarkCircle,
  failed: closeCircle,
  running: ellipseOutline,
  paused: pauseCircle,
  canceled: removeCircleOutline,
  waiting: ellipseOutline,
  skipped: removeCircleOutline,
};
function stepNote(state: RunStepState): string {
  if (state === 'skipped') return t('run.stepSkipped');
  if (state === 'canceled') return t('run.stepCanceled');
  if (state === 'running') return t('run.stepRunning');
  if (state === 'paused') return t('run.waitingApproval');
  return '';
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/home/runs" />
        </ion-buttons>
        <ion-title>{{ run?.task?.name }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div v-if="!loaded" aria-busy="true">
        <ion-skeleton-text animated style="width: 70%; height: 24px" />
        <ion-skeleton-text animated style="width: 40%" />
        <ion-skeleton-text animated style="width: 90%; height: 120px; margin-top: 24px" />
      </div>

      <p v-else-if="loadError" class="tl-error" role="alert">{{ loadError }}</p>

      <template v-else-if="run">
        <h1 class="name">{{ run.task?.name }}</h1>
        <div class="status" aria-live="polite">
          <run-status-pill :status="run.status" />
          <span class="tl-muted meta">{{ meta }}</span>
        </div>

        <p v-if="ended" class="tl-muted ended">{{ ended }}</p>
        <p v-if="cancelError" class="tl-error" role="alert">{{ cancelError }}</p>

        <div v-if="approval" class="tl-card approval">
          <div class="approval-head">
            <ion-icon :icon="timeOutline" aria-hidden="true" />
            <strong>{{ t('run.waitingApproval') }}</strong>
          </div>
          <p v-if="approval.title" class="approval-title">{{ approval.title }}</p>
          <p v-if="approval.details" class="approval-details">{{ approval.details }}</p>
          <ion-button fill="outline" size="small" router-link="/tabs/inbox">{{ t('run.reviewApproval') }}</ion-button>
        </div>

        <template v-if="run.status === 'completed'">
          <h2 class="tl-section-title">{{ t('run.result') }}</h2>
          <p v-if="outputs.length === 0" class="tl-muted">{{ t('run.noOutputs') }}</p>
          <div v-for="o in outputs" :key="o.variable.name" class="tl-card output">
            <strong>{{ o.variable.label || o.variable.name }}</strong>
            <pre class="tl-value">{{ o.hidden ? '••••••' : formatValue(o.value) }}</pre>
          </div>
        </template>

        <h2 class="tl-section-title">{{ t('run.steps') }}</h2>
        <p v-if="steps.length === 0" class="tl-muted">{{ t('run.noSteps') }}</p>
        <ol v-else class="tl-card steps">
          <li v-for="step in steps" :key="step.identifier" :class="step.state">
            <ion-spinner v-if="step.state === 'running'" name="crescent" aria-hidden="true" />
            <ion-icon v-else :icon="STEP_ICONS[step.state]" aria-hidden="true" />
            <div>
              <span>{{ step.label }}</span>
              <small v-if="step.error" class="step-error">{{ step.error }}</small>
              <small v-else-if="stepNote(step.state)" class="tl-muted">{{ stepNote(step.state) }}</small>
            </div>
            <small v-if="step.durationMs !== undefined" class="tl-muted took">{{ durationText(step.durationMs) }}</small>
          </li>
        </ol>

        <ion-button
          v-if="run.task?.identifier"
          fill="clear"
          class="open-workflow"
          :router-link="`/tabs/workflows/${encodeURIComponent(run.task.identifier)}`"
        >
          {{ t('run.openWorkflow') }}
        </ion-button>
      </template>
    </ion-content>

    <ion-footer v-if="canCancel" class="ion-no-border">
      <ion-toolbar class="run-bar">
        <ion-button expand="block" size="large" fill="outline" color="danger" :disabled="canceling" @click="cancel">
          <ion-spinner v-if="canceling" name="crescent" aria-hidden="true" />{{ canceling ? t('run.canceling') : t('run.cancel') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.name {
  margin: 4px 0 8px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.meta {
  font-size: 14px;
}
.ended {
  margin: 10px 0 0;
  font-size: 14px;
}
.approval {
  margin-top: 16px;
  border-color: var(--tl-waiting-bg);
  background: color-mix(in srgb, var(--tl-waiting-bg) 45%, var(--tl-card));
}
.approval-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--tl-waiting-ink);
}
.approval-title {
  margin: 8px 0 0;
  font-weight: 600;
}
.approval-details {
  margin: 4px 0 0;
  white-space: pre-wrap;
  font-size: 14px;
}
.approval ion-button {
  margin: 12px 0 0;
}
.output {
  margin-bottom: 10px;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 4px 16px;
}
.steps li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid var(--tl-border);
}
.steps li:last-child {
  border-bottom: 0;
}
.steps li div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.steps ion-icon,
.steps ion-spinner {
  flex: none;
  width: 20px;
  height: 20px;
  font-size: 20px;
  color: var(--tl-muted);
}
.steps li.done ion-icon {
  color: var(--tl-success-ink);
}
.steps li.failed ion-icon {
  color: var(--tl-failed-ink);
}
.steps li.paused ion-icon {
  color: var(--tl-waiting-ink);
}
.steps li.skipped span,
.steps li.canceled span {
  color: var(--tl-muted);
}
.step-error {
  color: var(--tl-failed-ink);
  white-space: pre-wrap;
  word-break: break-word;
}
.took {
  flex: none;
  font-size: 12px;
}
.open-workflow {
  margin: 16px 0 0;
}
.run-bar {
  --background: var(--tl-bg);
  padding: 8px 16px max(8px, env(safe-area-inset-bottom));
}
.run-bar ion-button {
  --border-radius: 12px;
  font-weight: 600;
  margin: 0;
}
.run-bar ion-spinner {
  width: 18px;
  height: 18px;
  margin-right: 8px;
}
</style>

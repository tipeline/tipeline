<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
  IonSpinner,
  IonIcon,
  IonSkeletonText,
  IonFooter,
} from '@ionic/vue';
import { checkmarkCircle, closeCircle, ellipseOutline, pauseCircle, removeCircleOutline } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import RunInputsForm from '@/components/RunInputsForm.vue';
import { useSession } from '@/session';
import { useWorkflowRun } from '@/composables/useWorkflowRun';
import {
  descriptionLine,
  initialValues,
  resultVariables,
  parseSource,
  runInputs,
  stepsFromSource,
  toRunVariables,
  type FormProblem,
  type WorkflowSource,
} from '@/lib/workflows';
import { finalOutputs, formatValue, type StepState } from '@/lib/runProgress';
import { confirmAction } from '@/lib/confirm';

const props = defineProps<{ identifier: string }>();

const { t } = useI18n();
const session = useSession();

const name = ref('');
const source = ref<WorkflowSource | null>(null);
const loaded = ref(false);
const loadError = ref('');

const inputs = computed(() => runInputs(source.value));
const steps = computed(() => stepsFromSource(source.value));
const values = ref<Record<string, unknown>>({});
const problems = ref<FormProblem[]>([]);

const { progress, start, reset } = useWorkflowRun(() => session.api());
const running = computed(() => progress.value?.state === 'starting' || progress.value?.state === 'running');
const outputs = computed(() => (progress.value ? finalOutputs(progress.value, resultVariables(source.value)) : []));

async function load() {
  loadError.value = '';
  try {
    const detail = await session.api().request<{ name: string; source: string }>('taskDetail', {
      identifier: props.identifier,
    });
    name.value = detail.name;
    source.value = parseSource(detail.source);
    values.value = initialValues(inputs.value);
  } catch (err) {
    loadError.value = (err as Error).message || t('workflow.notFound');
  } finally {
    loaded.value = true;
  }
}
onMounted(load);

function run() {
  const { variables, problems: found } = toRunVariables(inputs.value, values.value);
  problems.value = found;
  if (found.length) return;
  start(props.identifier, variables, steps.value);
}

const STEP_ICONS: Record<StepState, string> = {
  done: checkmarkCircle,
  failed: closeCircle,
  waiting: ellipseOutline,
  canceled: removeCircleOutline,
  skipped: removeCircleOutline,
  paused: pauseCircle,
};

function runAgain() {
  reset();
}

// Cancel needs the run's identifier, which the first event brings.
const canceling = ref(false);
const cancelError = ref('');
async function cancel() {
  const pipelineIdentifier = progress.value?.pipelineIdentifier;
  if (!pipelineIdentifier) return;
  const sure = await confirmAction({
    header: t('run.cancelTitle'),
    message: t('run.cancelBody'),
    confirm: t('run.cancel'),
    cancel: t('run.keepRunning'),
    destructive: true,
  });
  if (!sure || !running.value) return;
  canceling.value = true;
  cancelError.value = '';
  try {
    // The run's own stream then ends it on this page.
    await session.api().request('pipelineCancel', { pipelineIdentifier });
  } catch (err) {
    cancelError.value = t('run.cancelFailed', { message: (err as Error).message });
  } finally {
    canceling.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/workflows" />
        </ion-buttons>
        <ion-title>{{ name }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <div v-if="!loaded" aria-busy="true">
        <ion-skeleton-text animated style="width: 70%; height: 24px" />
        <ion-skeleton-text animated style="width: 95%" />
        <ion-skeleton-text animated style="width: 80%" />
      </div>

      <p v-else-if="loadError" class="tl-error" role="alert">{{ loadError }}</p>

      <template v-else>
        <h1 class="name">{{ name }}</h1>
        <p v-if="descriptionLine(source?.description)" class="tl-muted description">
          {{ descriptionLine(source?.description) }}
        </p>

        <!-- Before a run: the inputs -->
        <template v-if="!progress">
          <h2 class="tl-section-title">{{ t('workflow.inputs') }}</h2>
          <p v-if="inputs.length === 0" class="tl-muted">{{ t('workflow.noInputs') }}</p>

          <run-inputs-form v-else v-model="values" :inputs="inputs" :problems="problems" @submit="run" />
        </template>

        <!-- During and after a run: the steps and the result -->
        <template v-else>
          <div class="status" aria-live="polite">
            <span v-if="running" class="tl-pill waiting">
              <ion-spinner name="crescent" aria-hidden="true" />{{ t('workflow.running') }}
            </span>
            <span v-else-if="progress.state === 'finished'" class="tl-pill success">{{ t('workflow.finished') }}</span>
            <span v-else-if="progress.state === 'failed'" class="tl-pill failed">{{ t('workflow.failed') }}</span>
            <span v-else-if="progress.state === 'canceled'" class="tl-pill muted">{{ t('runs.status.canceled') }}</span>
            <span v-else-if="progress.state === 'paused'" class="tl-pill waiting">{{ t('run.waitingApproval') }}</span>
          </div>

          <p v-if="progress.state === 'lost'" class="tl-error" role="alert">{{ t('workflow.lostConnection') }}</p>
          <p v-if="progress.error" class="tl-error" role="alert">{{ progress.error }}</p>
          <p v-if="cancelError" class="tl-error" role="alert">{{ cancelError }}</p>
          <ion-button v-if="progress.state === 'paused'" fill="outline" size="small" router-link="/tabs/approvals">
            {{ t('run.reviewApproval') }}
          </ion-button>

          <template v-if="progress.state === 'finished'">
            <h2 class="tl-section-title">{{ t('workflow.result') }}</h2>
            <p v-if="outputs.length === 0" class="tl-muted">{{ t('workflow.noOutputs') }}</p>
            <div v-for="o in outputs" :key="o.variable.name" class="tl-card output">
              <strong>{{ o.variable.label || o.variable.name }}</strong>
              <pre class="tl-value">{{ o.variable.secret || progress.hidden.includes(o.variable.name) ? '••••••' : formatValue(o.value) }}</pre>
            </div>
          </template>

          <template v-if="progress.steps.length">
            <h2 class="tl-section-title">{{ t('workflow.steps') }}</h2>
            <ol class="tl-card steps">
              <li v-for="step in progress.steps" :key="step.identifier" :class="step.state">
                <ion-icon
                  :icon="STEP_ICONS[step.state]"
                  aria-hidden="true"
                />
                <div>
                  <span>{{ step.label }}</span>
                  <small v-if="step.error" class="step-error">{{ step.error }}</small>
                  <small v-else-if="step.state === 'canceled'" class="tl-muted">{{ t('run.stepCanceled') }}</small>
                  <small v-else-if="step.state === 'skipped'" class="tl-muted">{{ t('run.stepSkipped') }}</small>
                  <small v-else-if="step.state === 'paused'" class="tl-muted">{{ t('run.waitingApproval') }}</small>
                </div>
              </li>
            </ol>
          </template>

          <ion-button
            v-if="!running && progress.pipelineIdentifier"
            fill="clear"
            class="view-run"
            :router-link="`/tabs/runs/${encodeURIComponent(progress.pipelineIdentifier)}`"
          >
            {{ t('run.viewRun') }}
          </ion-button>
        </template>
      </template>
    </ion-content>

    <ion-footer v-if="loaded && !loadError" class="ion-no-border">
      <ion-toolbar class="run-bar">
        <ion-button v-if="!progress" expand="block" size="large" @click="run">{{ t('workflow.run') }}</ion-button>
        <ion-button
          v-else-if="running"
          expand="block"
          size="large"
          fill="outline"
          color="danger"
          :disabled="!progress.pipelineIdentifier || canceling"
          @click="cancel"
        >
          <ion-spinner v-if="canceling" name="crescent" aria-hidden="true" />{{ canceling ? t('run.canceling') : t('run.cancel') }}
        </ion-button>
        <ion-button v-else expand="block" size="large" fill="outline" @click="runAgain">
          {{ t('workflow.runAgain') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.name {
  margin: 4px 0 6px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.description {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}
.status {
  margin: 16px 0 8px;
}
.status ion-spinner {
  width: 14px;
  height: 14px;
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
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.steps ion-icon {
  flex: none;
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
.steps li.canceled span,
.steps li.skipped span {
  color: var(--tl-muted);
}
.step-error {
  color: var(--tl-failed-ink);
}
.view-run {
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

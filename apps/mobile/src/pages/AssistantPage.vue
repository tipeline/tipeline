<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonFooter,
  IonTextarea,
  IonSpinner,
} from '@ionic/vue';
import { add, arrowUp, checkmarkCircle, closeCircle, pauseCircle, chevronForward } from 'ionicons/icons';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import RunInputsForm from '@/components/RunInputsForm.vue';
import { useSession } from '@/session';
import { useAssistant, type Turn } from '@/assistantStore';
import { durationText, proposalInputs, resultOutputs } from '@/lib/assistant';
import { renderMarkdown } from '@/lib/markdown';
import { formatValue } from '@/lib/runProgress';

const { t } = useI18n();
const session = useSession();
const assistant = useAssistant();

const allowed = computed(() => session.user?.role !== 'viewer');
const draft = ref('');
const content = ref<InstanceType<typeof IonContent> | null>(null);

function send() {
  if (!draft.value.trim() || assistant.busy) return;
  assistant.ask(draft.value);
  draft.value = '';
}

function onKeydown(ev: KeyboardEvent) {
  // Enter sends on a hardware keyboard; Shift+Enter is a new line.
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    send();
  }
}

// Follow the conversation as it grows.
watch(
  () => assistant.turns.map((turn) => `${turn.state}:${turn.stepsDone}`).join(),
  async () => {
    await nextTick();
    await content.value?.$el.scrollToBottom(250);
  }
);

const inputsFor = (turn: Turn) => (turn.proposal ? proposalInputs(turn.proposal) : []);
const statusIcon = (turn: Turn) =>
  turn.result?.status === 'failed'
    ? closeCircle
    : turn.result?.status === 'paused'
      ? pauseCircle
      : turn.result?.status === 'canceled'
        ? closeCircle
        : checkmarkCircle;
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('assistant.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="allowed"
            :aria-label="t('assistant.newChat')"
            :disabled="assistant.turns.length === 0"
            @click="assistant.clear()"
          >
            <ion-icon slot="icon-only" :icon="add" aria-hidden="true" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content ref="content" class="ion-padding">
      <div v-if="!allowed" class="empty">
        <p class="tl-muted">{{ t('assistant.viewerOnly') }}</p>
      </div>

      <div v-else-if="assistant.turns.length === 0" class="empty">
        <h1>{{ t('assistant.emptyTitle') }}</h1>
        <p class="tl-muted">{{ t('assistant.emptyIntro') }}</p>
      </div>

      <div v-else class="turns" aria-live="polite">
        <section v-for="turn in assistant.turns" :key="turn.id" class="turn">
          <p class="bubble">{{ turn.prompt }}</p>

          <div class="reply">
            <!-- Working -->
            <p v-if="turn.state === 'thinking' || turn.state === 'searching'" class="working tl-muted">
              <ion-spinner name="dots" aria-hidden="true" />
              {{ turn.state === 'searching' && turn.query ? t('assistant.searching', { query: turn.query }) : t('assistant.thinking') }}
            </p>

            <!-- What the Assistant said -->
            <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
            <div v-if="turn.text && turn.state !== 'thinking'" class="said" v-html="renderMarkdown(turn.text)" />

            <p v-if="turn.state === 'nomatch'" class="tl-muted note">{{ t('assistant.noDraftsHere') }}</p>

            <!-- Which one? -->
            <div v-if="turn.state === 'choice'" class="options">
              <button
                v-for="option in turn.options"
                :key="option.identifier"
                type="button"
                class="tl-card option"
                @click="assistant.pick(turn.id, option.identifier)"
              >
                <span>
                  <strong>{{ option.name }}</strong>
                  <small v-if="option.description" class="tl-muted">{{ option.description }}</small>
                </span>
                <ion-icon :icon="chevronForward" aria-hidden="true" />
              </button>
            </div>

            <!-- A proposed run: the form, then Run -->
            <div v-if="turn.proposal && (turn.state === 'proposal' || turn.state === 'error')" class="tl-card proposal">
              <p class="kicker">{{ t('assistant.proposal') }}</p>
              <h2>{{ turn.proposal.name }}</h2>
              <p v-if="turn.proposal.remembered" class="tl-muted small">{{ t('assistant.remembered') }}</p>

              <p v-if="turn.proposal.hub" class="note">{{ t('assistant.notInstalled', { hub: turn.proposal.hub.name }) }}</p>
              <template v-else>
                <p v-if="turn.schedule" class="note">{{ t('assistant.scheduleOnDesktop', { schedule: turn.schedule }) }}</p>
                <run-inputs-form
                  v-if="inputsFor(turn).length"
                  v-model="turn.values"
                  :inputs="inputsFor(turn)"
                  :problems="turn.problems"
                  @submit="assistant.run(turn.id)"
                />
                <p v-else class="tl-muted small">{{ t('workflow.noInputs') }}</p>
                <ion-button
                  v-if="turn.state === 'proposal'"
                  expand="block"
                  class="run"
                  :disabled="assistant.busy"
                  @click="assistant.run(turn.id)"
                >
                  {{ t('workflow.run') }}
                </ion-button>
              </template>

              <div v-if="turn.proposal.alternatives.length" class="alternatives">
                <span class="tl-muted small">{{ t('assistant.alternatives') }}</span>
                <router-link
                  v-for="alt in turn.proposal.alternatives.filter((a) => !a.hub)"
                  :key="alt.identifier"
                  :to="`/tabs/workflows/${encodeURIComponent(alt.identifier)}`"
                >
                  {{ alt.name }}
                </router-link>
              </div>
            </div>

            <!-- Running, then the result -->
            <div v-if="turn.state === 'running' || turn.state === 'done' || (turn.state === 'error' && turn.result)" class="tl-card run-card">
              <span class="run-icon" :class="turn.state === 'running' ? 'waiting' : turn.result?.status">
                <ion-spinner v-if="turn.state === 'running'" name="crescent" aria-hidden="true" />
                <ion-icon v-else :icon="statusIcon(turn)" aria-hidden="true" />
              </span>
              <span class="run-text">
                <strong>
                  {{
                    turn.state === 'running'
                      ? t('assistant.running', { name: turn.proposal?.name })
                      : t(`assistant.ran.${turn.result?.status ?? 'completed'}`, { name: turn.proposal?.name })
                  }}
                </strong>
                <small class="tl-muted">
                  <template v-if="turn.state === 'running'">
                    {{ turn.stepsDone ? t('assistant.stepsDone', { count: turn.stepsDone }) : t('assistant.stepsNone') }}
                  </template>
                  <template v-else>{{ durationText(turn.result?.durationMs) }}</template>
                </small>
              </span>
              <router-link
                v-if="turn.proposal && turn.state !== 'running'"
                class="open"
                :to="`/tabs/workflows/${encodeURIComponent(turn.proposal.identifier)}`"
              >
                {{ t('assistant.open') }}
              </router-link>
            </div>

            <template v-if="turn.state === 'done'">
              <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
              <div v-if="turn.answer" class="said" v-html="renderMarkdown(turn.answer)" />
              <p v-if="turn.result?.status === 'failed' && turn.result.error" class="tl-error">{{ turn.result.error }}</p>
              <p v-if="turn.result?.status === 'paused'" class="note">{{ t('assistant.paused') }}</p>
              <details v-if="resultOutputs(turn.result).length" class="outputs">
                <summary>{{ t('assistant.outputs') }}</summary>
                <div v-for="o in resultOutputs(turn.result)" :key="o.name" class="output">
                  <strong>{{ o.label }}</strong>
                  <pre class="tl-value">{{ formatValue(o.value) }}</pre>
                </div>
              </details>
            </template>

            <!-- Problems -->
            <template v-if="turn.state === 'error'">
              <p v-if="turn.lost" class="tl-error" role="alert">{{ t('assistant.lost') }}</p>
              <p v-else-if="turn.error" class="tl-error" role="alert">{{ turn.error }}</p>
              <ion-button v-if="turn.proposal && !turn.proposal.hub" fill="outline" size="small" @click="assistant.retry(turn.id)">
                {{ t('assistant.tryAgain') }}
              </ion-button>
            </template>
          </div>
        </section>
      </div>
    </ion-content>

    <ion-footer v-if="allowed" class="ion-no-border">
      <ion-toolbar class="composer-bar">
        <form class="composer" @submit.prevent="send">
          <ion-textarea
            v-model="draft"
            class="box"
            :aria-label="t('assistant.message')"
            :placeholder="t('assistant.placeholder')"
            :auto-grow="true"
            :rows="1"
            autocapitalize="sentences"
            enterkeyhint="send"
            @keydown="onKeydown"
          />
          <ion-button
            type="submit"
            shape="round"
            class="send"
            :aria-label="t('assistant.send')"
            :disabled="!draft.trim() || assistant.busy"
          >
            <ion-icon slot="icon-only" :icon="arrowUp" aria-hidden="true" />
          </ion-button>
        </form>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.empty {
  padding: 32px 8px;
  text-align: center;
}
.empty h1 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
}
.empty p {
  margin: 0 auto;
  max-width: 320px;
  line-height: 1.5;
}
.turns {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 8px;
}
.turn {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bubble {
  align-self: flex-end;
  max-width: 82%;
  margin: 0;
  padding: 10px 14px;
  border-radius: 18px 18px 4px 18px;
  background: var(--tl-ink);
  color: var(--tl-bg);
  font-size: 15px;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reply {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 100%;
}
.working {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
}
.working ion-spinner {
  width: 22px;
  height: 22px;
}
.said {
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.said :deep(p) {
  margin: 0 0 8px;
}
.said :deep(p:last-child) {
  margin-bottom: 0;
}
.said :deep(ul),
.said :deep(ol) {
  margin: 4px 0 8px;
  padding-left: 20px;
}
.said :deep(code) {
  font-size: 13px;
  background: var(--tl-border);
  border-radius: 4px;
  padding: 1px 4px;
}
.said :deep(pre) {
  overflow-x: auto;
}
.said :deep(a) {
  color: var(--tl-accent);
}
.note {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tl-waiting-bg);
  color: var(--tl-waiting-ink);
}
.small {
  font-size: 13px;
  margin: 0;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.option span {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.option strong {
  font-size: 15px;
}
.option small {
  font-size: 13px;
  line-height: 1.35;
}
.option ion-icon {
  color: var(--tl-muted);
  flex: none;
}
.proposal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.kicker {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tl-muted);
}
.proposal h2 {
  margin: -6px 0 0;
  font-size: 17px;
  font-weight: 700;
}
.run {
  --border-radius: 12px;
  margin: 0;
  min-height: 46px;
  font-weight: 600;
}
.alternatives {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  font-size: 14px;
}
.alternatives a {
  color: var(--tl-accent);
  text-decoration: none;
  font-weight: 500;
}
.run-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.run-icon {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tl-success-bg);
  color: var(--tl-success-ink);
  font-size: 20px;
}
.run-icon.waiting,
.run-icon.paused {
  background: var(--tl-waiting-bg);
  color: var(--tl-waiting-ink);
}
.run-icon.failed,
.run-icon.canceled {
  background: var(--tl-failed-bg);
  color: var(--tl-failed-ink);
}
.run-icon ion-spinner {
  width: 18px;
  height: 18px;
}
.run-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.run-text strong {
  font-size: 14px;
}
.run-text small {
  font-size: 12px;
}
.open {
  color: var(--tl-accent);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  padding: 10px 4px;
}
.outputs summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--tl-muted);
  padding: 6px 0;
}
.output {
  margin-top: 8px;
}
.output strong {
  font-size: 13px;
}
.composer-bar {
  --background: var(--tl-bg);
  padding: 6px 12px max(8px, env(safe-area-inset-bottom));
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.box {
  flex: 1;
  min-height: 46px;
  margin: 0;
  padding: 0 16px;
  border: 1px solid var(--tl-border);
  border-radius: 23px;
  background: var(--tl-card);
  font-size: 15px;
  --padding-top: 12px;
  --padding-bottom: 12px;
  --highlight-height: 0;
  max-height: 140px;
  overflow-y: auto;
}
.send {
  flex: none;
  width: 46px;
  height: 46px;
  margin: 0;
  --padding-start: 0;
  --padding-end: 0;
}
</style>

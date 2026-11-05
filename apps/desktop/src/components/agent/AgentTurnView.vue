<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CalendarCheckIcon, Loader2Icon } from 'lucide-vue-next';
import { renderMarkdown } from '@/utils/appMarkdown';
import AgentProposalCard from '@/components/agent/AgentProposalCard.vue';
import AgentHubProposalCard from '@/components/agent/AgentHubProposalCard.vue';
import AgentChoiceCard from '@/components/agent/AgentChoiceCard.vue';
import AgentNoMatchCard from '@/components/agent/AgentNoMatchCard.vue';
import AgentDraftedCard from '@/components/agent/AgentDraftedCard.vue';
import AgentRunResult from '@/components/agent/AgentRunResult.vue';
import type { AgentTurn } from '@/store/agentStore';
import { useScheduleText } from '@/composables/useScheduleText';

/** One request and everything that came back for it. */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const router = useRouter();

const textHtml = computed(() => renderMarkdown(props.turn.text ?? ''));
const answerHtml = computed(() => renderMarkdown(props.turn.answer ?? ''));

const draftingLabel = computed(() => t(`agent.draft.step.${props.turn.draftStep ?? 'writing'}`));

const thinkingLabel = computed(() =>
  props.turn.searching ? t('agent.status.searching', { query: props.turn.searching }) : t('agent.status.thinking')
);

const { describe, formatTime } = useScheduleText();

function openLiveRun() {
  if (!props.turn.livePipeline || !props.turn.proposal) return;
  router.push(`/tasks/${props.turn.proposal.identifier}/pipelines/${props.turn.livePipeline}`);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex justify-end">
      <p class="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
        {{ turn.prompt }}
      </p>
    </div>

    <div v-if="turn.phase === 'thinking'" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon class="w-4 h-4 animate-spin" /> {{ thinkingLabel }}
    </div>

    <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
    <div v-else-if="turn.phase === 'answer'" class="app-markdown text-sm" v-html="textHtml" />

    <AgentChoiceCard v-else-if="turn.phase === 'choice'" :turn="turn" />

    <AgentNoMatchCard v-else-if="turn.phase === 'nomatch'" :turn="turn" />

    <div v-else-if="turn.phase === 'drafting'" class="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon class="w-4 h-4 animate-spin" /> {{ draftingLabel }}
    </div>

    <AgentDraftedCard v-else-if="turn.phase === 'drafted'" :turn="turn" />

    <template v-else-if="turn.phase === 'proposal'">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
      <div v-if="turn.text" class="app-markdown text-sm" v-html="textHtml" />
      <AgentHubProposalCard v-if="turn.proposal?.hub" :turn="turn" />
      <AgentProposalCard v-else :turn="turn" />
    </template>

    <p v-else-if="turn.phase === 'dismissed'" class="text-xs text-muted-foreground">
      {{
        turn.proposal
          ? t('agent.proposal.dismissed', { name: turn.proposal.name })
          : turn.draftRequest
            ? t('agent.draft.dismissed')
            : t('agent.choice.dismissed')
      }}
    </p>

    <div v-else-if="turn.phase === 'running'" class="space-y-2">
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon class="w-4 h-4 animate-spin" />
        <span v-if="!turn.result">{{ t('agent.status.taskRunning', { name: turn.proposal?.name ?? '' }) }}</span>
        <span v-else>{{ t('agent.result.summarizing') }}</span>
        <button v-if="turn.livePipeline && !turn.result" class="ml-auto text-xs text-primary hover:underline" @click="openLiveRun">
          {{ t('agent.viewLiveRun') }}
        </button>
      </div>
      <AgentRunResult
        v-if="turn.result && turn.proposal"
        :result="turn.result"
        :workflow-name="turn.proposal.name"
        :workflow-identifier="turn.proposal.identifier"
      />
    </div>

    <div v-else-if="turn.phase === 'done'" class="space-y-2">
      <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
      <div v-if="turn.answer" class="app-markdown text-sm" v-html="answerHtml" />
      <AgentRunResult
        v-if="turn.result && turn.proposal"
        :result="turn.result"
        :workflow-name="turn.proposal.name"
        :workflow-identifier="turn.proposal.identifier"
      />
    </div>

    <div v-else-if="turn.phase === 'scheduled' && turn.scheduled" class="rounded-md border text-sm" data-testid="agent-scheduled">
      <div class="flex items-start gap-2 px-3 py-2">
        <CalendarCheckIcon class="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div class="min-w-0 flex-1">
          <p>
            {{ t('agent.schedule.created', { name: turn.proposal?.name ?? '', when: describe(turn.scheduled) }) }}
          </p>
          <p v-if="turn.scheduled.nextRunAt" class="text-xs text-muted-foreground tabular-nums">
            {{ t('schedules.nextRun') }}: {{ formatTime(turn.scheduled.nextRunAt) }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 px-3 py-2 border-t text-xs">
        <button class="text-primary hover:underline" @click="router.push(`/tasks/${turn.proposal?.identifier}`)">
          {{ t('agent.schedule.openWorkflow') }}
        </button>
        <button class="text-primary hover:underline" @click="router.push('/schedules')">
          {{ t('schedules.card.viewAll') }}
        </button>
      </div>
    </div>

    <p v-else-if="turn.phase === 'error'" class="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
      {{ turn.error }}
    </p>
  </div>
</template>

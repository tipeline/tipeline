<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CalendarClockIcon,
  DownloadIcon,
  Loader2Icon,
  PackageIcon,
  SparklesIcon,
  TriangleAlert,
  Workflow,
  XIcon,
} from 'lucide-vue-next';
import { MIN_SCHEDULE_INTERVAL_SECONDS, parseSchedule } from '@tipeline/utils';
import type { ReusedWorkflow } from '@tipeline/agent';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useScheduleText } from '@/composables/useScheduleText';
import { toast } from '@/components/ui/sonner';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useAgentStore, type AgentTurn } from '@/store/agentStore';

/**
 * No workflow does what was asked. Offers to draft one from the assistant's
 * description, which the user can edit first. Nothing is written until they
 * click, and the draft never runs until they've tested it.
 *
 * Workflows that each do part of the request are listed: the draft runs them as
 * steps. One still on a hub can be installed here; left uninstalled, the draft
 * builds that part from actions instead.
 *
 * When drafting stops because part of the request can't be done, nothing has been
 * saved: the card says what's missing and offers to draft the rest, marked incomplete.
 */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const agentStore = useAgentStore();

const description = ref(props.turn.draftRequest ?? '');
watch(
  () => props.turn.draftRequest,
  (next) => {
    if (next !== undefined) description.value = next;
  }
);

// When it runs on its own, apart from what it does: the draft does one run and
// comes with this as its proposed schedule.
const schedule = ref(props.turn.schedule ?? '');
watch(
  () => props.turn.schedule,
  (next) => {
    schedule.value = next ?? '';
  }
);
const { describe } = useScheduleText();
const scheduleReading = computed(() => {
  if (!schedule.value.trim()) return null;
  const parsed = parseSchedule(schedule.value);
  if (!parsed.ok) {
    return { error: true, text: t(`schedules.form.errors.${parsed.error}`, { seconds: MIN_SCHEDULE_INTERVAL_SECONDS }) };
  }
  return {
    error: false,
    text: describe(
      parsed.kind === 'cron'
        ? { cron: parsed.cron }
        : parsed.kind === 'interval'
          ? { everySeconds: parsed.seconds }
          : { runAt: parsed.runAt.toISOString() }
    ),
  };
});
const canDraft = computed(
  () => !!description.value.trim() && installing.value === null && !scheduleReading.value?.error
);

const installing = ref<string | null>(null);

async function install(workflow: ReusedWorkflow) {
  if (!workflow.hub) return;
  installing.value = workflow.identifier;
  try {
    const installed = await invokeCore<{ identifier: string; name?: string }>(SEND.HUB_INSTALL_TASK, {
      hubId: workflow.hub.id,
      itemIdentifier: workflow.hub.itemIdentifier,
    });
    if (!installed?.identifier) throw new Error(t('agent.hub.installFailed'));
    agentStore.adoptInstalledReuse(props.turn.id, workflow.identifier, installed);
  } catch (error: any) {
    toast.error(t('agent.hub.installFailed'), { description: error?.message ?? String(error) });
  } finally {
    installing.value = null;
  }
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm">{{ turn.text }}</p>
    <div class="rounded-md border p-3 space-y-2">
      <label class="text-xs font-medium text-muted-foreground" :for="`draft-${turn.id}`">
        {{ t('agent.draft.describeLabel') }}
      </label>
      <Textarea
        :id="`draft-${turn.id}`"
        v-model="description"
        class="min-h-24 max-h-60 resize-y text-sm"
      />

      <div v-if="turn.schedule || schedule" class="space-y-1" data-testid="nomatch-schedule">
        <label class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" :for="`schedule-${turn.id}`">
          <CalendarClockIcon class="w-3.5 h-3.5" /> {{ t('agent.draft.scheduleLabel') }}
        </label>
        <Input :id="`schedule-${turn.id}`" v-model="schedule" class="h-8 text-sm" autocomplete="off" />
        <p
          v-if="scheduleReading"
          class="text-[11px]"
          :class="scheduleReading.error ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'"
        >
          {{ scheduleReading.text }}
        </p>
        <p class="text-[11px] text-muted-foreground">{{ t('agent.draft.scheduleHint') }}</p>
      </div>

      <div v-if="turn.reuse && turn.reuse.length > 0" class="space-y-1">
        <p class="text-xs font-medium text-muted-foreground">{{ t('agent.draft.reuseLabel') }}</p>
        <ul class="space-y-1">
          <li
            v-for="workflow in turn.reuse"
            :key="workflow.identifier"
            class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            :class="workflow.hub ? 'bg-muted/40' : ''"
          >
            <PackageIcon v-if="workflow.hub" class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <Workflow v-else class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ workflow.name }}</p>
              <p v-if="workflow.hub" class="text-[11px] text-muted-foreground truncate">
                {{ t('agent.hub.notInstalled', { hub: workflow.hub.name }) }}
              </p>
            </div>
            <Button
              v-if="workflow.hub"
              size="sm"
              variant="outline"
              class="h-7 px-2.5 text-xs border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              :disabled="installing !== null"
              @click="install(workflow)"
            >
              <Loader2Icon v-if="installing === workflow.identifier" class="w-3 h-3 mr-1 animate-spin" />
              <DownloadIcon v-else class="w-3 h-3 mr-1" />
              {{ t('agent.draft.install') }}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              class="h-7 w-7 shrink-0"
              :aria-label="t('agent.draft.leaveOut', { name: workflow.name })"
              :title="t('agent.draft.leaveOut', { name: workflow.name })"
              @click="agentStore.removeReuse(turn.id, workflow.identifier)"
            >
              <XIcon class="w-3.5 h-3.5" />
            </Button>
          </li>
        </ul>
        <p v-if="turn.reuse.some((w) => w.hub)" class="text-[11px] text-muted-foreground">
          {{ t('agent.draft.reuseHubNote') }}
        </p>
      </div>

      <div
        v-if="turn.draftGap"
        class="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs space-y-1.5"
      >
        <p class="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <TriangleAlert class="w-3.5 h-3.5 shrink-0" />
          {{ t('agent.draft.gap.title') }}
        </p>
        <ul class="list-disc pl-4 space-y-0.5">
          <li v-for="(part, i) in turn.draftGap.missing" :key="i" class="break-words">{{ part }}</li>
        </ul>
        <p v-if="turn.draftGap.possible" class="text-muted-foreground">
          {{ t('agent.draft.gap.possible', { possible: turn.draftGap.possible }) }}
        </p>
        <p class="text-muted-foreground">{{ t('agent.draft.gap.choose') }}</p>
      </div>

      <div
        v-if="turn.draftError"
        class="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-2 text-xs space-y-1"
      >
        <p class="text-red-600 dark:text-red-400">{{ turn.draftError.text }}</p>
        <ul v-if="turn.draftError.errors.length > 0" class="list-disc pl-4 text-muted-foreground space-y-0.5">
          <li v-for="(error, i) in turn.draftError.errors.slice(0, 5)" :key="i" class="break-words">{{ error }}</li>
        </ul>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="!canDraft" @click="agentStore.draft(turn.id, description, [], schedule)">
          <SparklesIcon class="w-3.5 h-3.5 mr-1" />
          {{ turn.draftError || turn.draftGap ? t('agent.draft.tryAgain') : t('agent.draft.start') }}
        </Button>
        <Button
          v-if="turn.draftGap"
          size="sm"
          variant="outline"
          :disabled="!canDraft"
          @click="agentStore.draft(turn.id, description, turn.draftGap.missing, schedule)"
        >
          {{ t('agent.draft.gap.createIncomplete') }}
        </Button>
        <Button size="sm" variant="ghost" @click="agentStore.dismissProposal(turn.id)">
          {{ t('agent.proposal.dismiss') }}
        </Button>
      </div>
      <p class="text-[11px] text-muted-foreground">{{ t('agent.draft.note') }}</p>
    </div>
  </div>
</template>

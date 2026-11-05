<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { BotIcon, HistoryIcon, SquarePenIcon, XIcon, ArrowUpIcon } from 'lucide-vue-next';
import { PROVIDER_LABELS, type ProviderName } from '@tipeline/agent/provider-names';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AgentTurnView from '@/components/agent/AgentTurnView.vue';
import AgentSetupCard from '@/components/agent/AgentSetupCard.vue';
import { useAgentStore, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '@/store/agentStore';
import { useSettingsStore } from '@/store/settingsStore';

/** The assistant, docked on the right of every page. */
const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();
const settingsStore = useSettingsStore();

const draft = ref('');
const composer = ref<InstanceType<typeof Textarea> | null>(null);
const thread = ref<HTMLElement | null>(null);

const providerLabel = computed(() => {
  const provider = settingsStore.get('agent_provider', 'deepseek') as ProviderName;
  return PROVIDER_LABELS[provider] ?? provider;
});

function focusComposer() {
  const el = (composer.value as any)?.$el ?? composer.value;
  (el as HTMLTextAreaElement | null)?.focus();
}

onMounted(async () => {
  await settingsStore.load().catch(() => {});
  focusComposer();
});

async function send() {
  const text = draft.value.trim();
  if (!text || agentStore.busyThinking) return;
  if (await agentStore.submit(text)) draft.value = '';
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void send();
  }
}

// Follow the conversation as turns are added and change phase.
watch(
  () => agentStore.turns.map((turn) => turn.phase).join() + agentStore.pendingPrompt,
  async () => {
    await nextTick();
    thread.value?.scrollTo({ top: thread.value.scrollHeight, behavior: 'smooth' });
  }
);

function startResize(e: PointerEvent) {
  const startX = e.clientX;
  const startWidth = agentStore.sidebarWidth;
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const onMove = (move: PointerEvent) => {
    const width = startWidth + (startX - move.clientX);
    agentStore.sidebarWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
  };
  const onUp = () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onUp);
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
}

function newChat() {
  agentStore.newChat();
  focusComposer();
}
</script>

<template>
  <!-- The outer box is what slides open (see DefaultLayout); the panel keeps its full width
       inside it so the chat is uncovered rather than squeezed. -->
  <div class="hidden md:flex h-full shrink-0" :style="{ width: `${agentStore.sidebarWidth}px` }">
    <aside
      class="relative flex h-full shrink-0 flex-col border-l bg-background"
      :style="{ width: `${agentStore.sidebarWidth}px` }"
      :aria-label="t('agent.sidebar.title')"
    >
      <div
        class="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-10 hover:bg-primary/20"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startResize"
      />

      <div class="flex items-center gap-2 border-b px-4 h-14 shrink-0">
        <BotIcon class="w-4 h-4 text-muted-foreground" />
        <span class="text-sm font-medium">{{ t('agent.sidebar.title') }}</span>
        <span class="text-[11px] text-muted-foreground border rounded-full px-2 py-0.5">{{ providerLabel }}</span>
        <div class="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" class="h-8 w-8" :title="t('agent.sidebar.newChat')" @click="newChat">
            <SquarePenIcon class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" :title="t('agent.sidebar.history')" @click="router.push('/agent')">
            <HistoryIcon class="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" class="h-8 w-8" :title="t('agent.sidebar.close')" @click="agentStore.sidebarOpen = false">
            <XIcon class="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref="thread" class="flex-1 min-h-0 overflow-y-auto scroll-fade px-4 py-4 space-y-6">
        <div v-if="agentStore.turns.length === 0 && !agentStore.pendingPrompt" class="h-full flex flex-col items-center justify-center text-center px-6">
          <BotIcon class="w-10 h-10 mb-3 text-muted-foreground/40" />
          <p class="text-sm font-medium">{{ t('agent.sidebar.emptyTitle') }}</p>
          <p class="text-xs text-muted-foreground mt-1 max-w-[30ch]">{{ t('agent.sidebar.emptyDescription') }}</p>
        </div>
        <AgentTurnView v-for="turn in agentStore.turns" :key="turn.id" :turn="turn" />
        <AgentSetupCard v-if="agentStore.pendingPrompt" />
      </div>

      <div class="border-t p-3 space-y-2 shrink-0">
        <button
          v-if="agentStore.activeProject?.instructions"
          type="button"
          class="flex items-center gap-1.5 max-w-full text-[11px] text-muted-foreground hover:text-foreground"
          :title="t('agent.sidebar.projectInstructionsTitle')"
          @click="router.push(`/projects/${agentStore.activeProject.identifier}`)"
        >
          <span
            class="w-2 h-2 rounded-full shrink-0 bg-muted-foreground"
            :style="agentStore.activeProject.color ? { backgroundColor: agentStore.activeProject.color } : undefined"
          />
          <span class="truncate">{{ t('agent.sidebar.projectInstructions', { name: agentStore.activeProject.name }) }}</span>
        </button>
        <Textarea
          ref="composer"
          v-model="draft"
          :placeholder="t('agent.sidebar.placeholder')"
          class="min-h-24 max-h-60 resize-none text-sm"
          @keydown="onKeydown"
        />
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] text-muted-foreground">{{ t('agent.sidebar.hint') }}</span>
          <Button size="sm" :disabled="!draft.trim() || agentStore.busyThinking" @click="send">
            <ArrowUpIcon class="w-3.5 h-3.5 mr-1" /> {{ t('agent.sidebar.send') }}
          </Button>
        </div>
      </div>
    </aside>
  </div>
</template>

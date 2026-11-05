<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRightIcon, PackageIcon, WorkflowIcon } from 'lucide-vue-next';
import { useAgentStore, type AgentTurn } from '@/store/agentStore';

/**
 * "Which one do you mean?": the workflows that fit the request about equally.
 * Picking one turns it into the normal proposal and is remembered for next time.
 */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const agentStore = useAgentStore();

const options = computed(() => props.turn.choice?.options ?? []);
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm">{{ turn.text || t('agent.choice.fallbackQuestion') }}</p>
    <div class="rounded-md border divide-y">
      <button
        v-for="option in options"
        :key="option.identifier"
        class="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 outline-none"
        @click="agentStore.choose(turn.id, option.identifier)"
      >
        <component
          :is="option.hub ? PackageIcon : WorkflowIcon"
          class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground"
        />
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">{{ option.name }}</span>
            <span v-if="option.hub" class="text-[11px] text-muted-foreground border rounded-full px-2 py-0.5">
              {{ t('agent.hub.notInstalled', { hub: option.hub.name }) }}
            </span>
          </span>
          <span v-if="option.description" class="block text-xs text-muted-foreground line-clamp-2">
            {{ option.description }}
          </span>
        </span>
        <ChevronRightIcon class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
    <div class="flex items-center justify-between gap-2">
      <span class="text-[11px] text-muted-foreground">{{ t('agent.choice.remembered') }}</span>
      <button class="text-xs text-muted-foreground hover:text-foreground" @click="agentStore.dismissProposal(turn.id)">
        {{ t('agent.choice.none') }}
      </button>
    </div>
  </div>
</template>

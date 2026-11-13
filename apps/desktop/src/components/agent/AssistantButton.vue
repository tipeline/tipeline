<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Bot as BotIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

/**
 * Opens and closes the Assistant sidebar, with ⌘K. One per screen: the main header has it,
 * and so does each builder's toolbar (they have no main header).
 */
const { t } = useI18n();
const agentStore = useAgentStore();
const connectionStore = useConnectionStore();

const disabled = computed(() => connectionStore.isRemote);

function toggle() {
  agentStore.sidebarOpen = !agentStore.sidebarOpen;
}

useKeyboardShortcuts([{ key: 'k', meta: true, enabled: () => !disabled.value, handler: toggle }]);
</script>

<template>
  <Button
    :variant="agentStore.sidebarOpen ? 'secondary' : 'ghost'"
    size="icon"
    :disabled="disabled"
    :title="disabled ? t('agent.disabledRemote') : t('agent.tooltip')"
    :aria-label="t('agent.tooltip')"
    :aria-pressed="agentStore.sidebarOpen"
    @click="toggle"
  >
    <BotIcon class="size-4" :class="agentStore.working && 'text-primary animate-pulse'" />
  </Button>
</template>

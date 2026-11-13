<script setup lang="ts">
import AgentSidebar from '@/components/agent/AgentSidebar.vue';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';

/** The Assistant sidebar where a layout shows it, sliding in at the left sidebar's pace. */
const agentStore = useAgentStore();
const connectionStore = useConnectionStore();
</script>

<template>
  <Transition name="assistant-slide">
    <AgentSidebar v-if="agentStore.sidebarOpen && !connectionStore.isRemote" />
  </Transition>
</template>

<style scoped>
/* Same timing as the left sidebar. Only while opening or closing, so resizing stays immediate
   and the resize handle isn't clipped the rest of the time. */
.assistant-slide-enter-active,
.assistant-slide-leave-active {
  overflow: hidden;
  transition: width 200ms linear;
}
.assistant-slide-enter-from,
.assistant-slide-leave-to {
  width: 0 !important;
}
@media (prefers-reduced-motion: reduce) {
  .assistant-slide-enter-active,
  .assistant-slide-leave-active {
    transition: none;
  }
}
</style>

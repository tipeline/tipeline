<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { getStoredSidebarOpen, SidebarProvider } from '@/components/ui/sidebar';
import Sidebar from '@/components/Sidebar.vue';
import Header from '@/components/Header.vue';
import AgentSidebar from '@/components/agent/AgentSidebar.vue';
import { useAgentStore } from '@/store/agentStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useI18n } from 'vue-i18n';
import { toast } from '@/components/ui/sonner';

const route = useRoute();
const router = useRouter();
const viewKey = ref(0);
const { t } = useI18n();
const sidebarOpen = getStoredSidebarOpen() ?? true;
const agentStore = useAgentStore();
const connectionStore = useConnectionStore();

function onWorkspaceChanged(_event: unknown, data?: { closedWindows?: number }) {
  // Windows opened on their own showed the previous workspace; the main process closed them.
  if (data?.closedWindows) toast.info(t('windows.closedOnSwitch', { count: data.closedWindows }));
  // A page showing a single item may point at something the new workspace doesn't have,
  // so go back to its list instead of reloading it.
  const fallback = route.matched.findLast((r) => r.meta.workspaceFallback)?.meta.workspaceFallback;
  if (fallback) {
    router.replace(fallback as RouteLocationRaw);
    return;
  }
  viewKey.value++;
}

onMounted(() => window.ipcRenderer.on('workspace-changed', onWorkspaceChanged));
onUnmounted(() => window.ipcRenderer.off('workspace-changed', onWorkspaceChanged));
</script>

<template>
  <div class="flex h-screen flex-row">
    <SidebarProvider :default-open="sidebarOpen">
      <Sidebar />
      <main class="min-w-0 hidden h-full flex-1 flex-col space-y-4 p-6 md:flex">
        <Header />
        <router-view :key="viewKey" />
      </main>
      <Transition name="assistant-slide">
        <AgentSidebar v-if="agentStore.sidebarOpen && !connectionStore.isRemote" />
      </Transition>
    </SidebarProvider>
  </div>
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

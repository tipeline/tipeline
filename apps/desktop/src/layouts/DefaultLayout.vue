<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router';
import { getStoredSidebarOpen, SidebarProvider } from '@/components/ui/sidebar';
import Sidebar from '@/components/Sidebar.vue';
import Header from '@/components/Header.vue';
import AssistantPanel from '@/components/agent/AssistantPanel.vue';
import { useI18n } from 'vue-i18n';
import { toast } from '@/components/ui/sonner';
import { resetHistory } from '@/router/navHistory';

const route = useRoute();
const router = useRouter();
const viewKey = ref(0);
const { t } = useI18n();
const sidebarOpen = getStoredSidebarOpen() ?? true;

function onWorkspaceChanged(_event: unknown, data?: { closedWindows?: number }) {
  // Windows opened on their own showed the previous workspace; the main process closed them.
  if (data?.closedWindows) toast.info(t('windows.closedOnSwitch', { count: data.closedWindows }));
  // Earlier pages belong to the previous workspace: Back must not lead to them.
  resetHistory();
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
      <AssistantPanel />
    </SidebarProvider>
  </div>
</template>


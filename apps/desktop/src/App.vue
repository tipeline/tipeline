<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useColorMode } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';

useColorMode();
import EditLayout from '@/layouts/EditLayout.vue';
import BuilderLayout from '@/layouts/BuilderLayout.vue';
import DefaultLayout from '@/layouts/DefaultLayout.vue';
import StandaloneLayout from '@/layouts/StandaloneLayout.vue';
import {
  useStreamStore,
  type StreamEvent,
  type StreamEventType,
} from '@/store/stream';
import { Toaster } from '@/components/ui/sonner';
import Loader from '@/components/Loader.vue';
import NewTaskDialog from '@/components/NewTaskDialog.vue';
import NewAppDialog from '@/components/NewAppDialog.vue';
import { SEND } from '@/ipc-channels';
import { whenCoreIdle } from '@/composables/useWhenCoreIdle';
import { useAppInit, type CoreUpdateOffer } from '@/composables/useAppInit';
import { useSettingsStore } from '@/store/settingsStore';
import { applyLocaleFromStorage, applyStoredLocale } from '@/composables/useLocale';
import { applyStoredTimezone } from '@/composables/useTimezone';
import { useNavHistoryInput } from '@/composables/useNavHistoryInput';

const route = useRoute();
useNavHistoryInput();
const router = useRouter();
const { t } = useI18n();
const streamStore = useStreamStore();
const settingsStore = useSettingsStore();
const { ready, statusKey, errorText, coreUpdateOffer, desktopOutdated, autoStartNotice, init, restartCore, checkHealth, handleCoreDown, handleCoreBack } = useAppInit();
const appVisible = ref(false);

// May arrive before the Toaster is mounted (main process connects to Core
// concurrently with renderer boot), so queue it until the app is visible. The watcher below runs
// after the render, since a toast sent before the Toaster mounts is lost.
const pendingWorkspaceUnavailable = ref(false);
const pendingAppUpdate = ref<string | null>(null);

function onWorkspaceUnavailable() {
  pendingWorkspaceUnavailable.value = true;
}

watch(appVisible, (visible) => {
  if (visible && pendingWorkspaceUnavailable.value) {
    pendingWorkspaceUnavailable.value = false;
    toast.warning(t('workspace.unavailableAtStartup'));
  }
  if (visible && coreUpdateOffer.value) offerCoreRestart(coreUpdateOffer.value);
  if (visible && desktopOutdated.value) {
    toast.warning(
      t('loader.desktopOutdated', { running: desktopOutdated.value.running ?? '', bundled: desktopOutdated.value.bundled ?? '' }),
      { description: t('loader.desktopOutdatedHint'), duration: Infinity }
    );
  }
  if (visible && pendingAppUpdate.value) offerAppUpdate(pendingAppUpdate.value);
  if (visible && autoStartNotice.value) {
    autoStartNotice.value = false;
    toast.info(t('settings.about.autoStartNotice'), {
      duration: Infinity,
      action: { label: t('settings.about.autoStartNoticeAction'), onClick: () => router.push('/settings/about') },
    });
  }
}, { flush: 'post' });

// One id per stage: a toast measures its height once, so updating one in place would cut off
// the buttons of the next stage. It looks the same, since each appears where the last one was.
const CORE_STOP_TOASTS = { brief: 'core-stop-brief', choice: 'core-stop-choice', waiting: 'core-stop-waiting' };

function showOnlyCoreStopToast(stage?: keyof typeof CORE_STOP_TOASTS) {
  for (const [name, id] of Object.entries(CORE_STOP_TOASTS)) {
    if (name !== stage) toast.dismiss(id);
  }
}

/** Lets active runs end or the user decide, in a toast that changes as things move on. */
function afterCoreIsFree(proceed: (interrupt: boolean) => void) {
  whenCoreIdle({
    activeRuns: async () => (await window.ipcRenderer.invoke(SEND.CORE_VERSION_CHECK))?.activeRuns,
    onWaitingBriefly: (count) => {
      showOnlyCoreStopToast('brief');
      toast.loading(t('loader.stopWaitingBriefly', count), { id: CORE_STOP_TOASTS.brief, duration: Infinity });
    },
    onAskUser: (count, choose) => {
      showOnlyCoreStopToast('choice');
      toast.warning(t('loader.stopStillRunning', count), {
        id: CORE_STOP_TOASTS.choice,
        class: 'core-stop-toast',
        description: t('loader.stopChoice'),
        duration: Infinity,
        action: { label: t('loader.stopInterrupt'), onClick: choose.interrupt },
        cancel: { label: t('loader.stopWait'), onClick: choose.wait },
      });
    },
    onWaitingForRuns: (count, choose) => {
      showOnlyCoreStopToast('waiting');
      toast.loading(t('loader.stopWaitingForRuns', count), {
        id: CORE_STOP_TOASTS.waiting,
        class: 'core-stop-toast',
        duration: Infinity,
        action: { label: t('loader.stopInterrupt'), onClick: choose.interrupt },
        cancel: { label: t('loader.stopNeverMind'), onClick: choose.cancel },
      });
    },
    proceed: (interrupt) => {
      showOnlyCoreStopToast();
      proceed(interrupt);
    },
  });
}

function installAppUpdate() {
  afterCoreIsFree(async (interrupt) => {
    const result = await window.ipcRenderer.invoke(SEND.APP_UPDATE_INSTALL, interrupt);
    if (!result?.installing) toast.warning(t('loader.updateCoreBusy'));
  });
}

function offerAppUpdate(version: string) {
  toast.info(t('loader.updateReady', { version }), {
    id: 'app-update',
    duration: Infinity,
    action: {
      label: t('loader.updateInstall'),
      onClick: (event: MouseEvent) => {
        // Stays up: if Tipeline is busy, the same button works once it's done.
        event.preventDefault();
        installAppUpdate();
      },
    },
  });
}

function onAppUpdateReady(_: unknown, version: string) {
  pendingAppUpdate.value = version;
  if (appVisible.value) offerAppUpdate(version);
}

function offerCoreRestart(offer: CoreUpdateOffer) {
  const { activeRuns } = offer;
  toast.warning(t('loader.coreOutdated', { running: offer.running ?? '', bundled: offer.bundled ?? '' }), {
    description: activeRuns
      ? t('loader.coreOutdatedRuns', activeRuns)
      : t('loader.coreOutdatedAnyRuns'),
    duration: Infinity,
    action: {
      label: t('loader.coreRestart'),
      onClick: () => {
        afterCoreIsFree(() => {
          appVisible.value = false;
          restartCore();
        });
      },
    },
  });
}

async function onCoreDown() {
  if (!appVisible.value) return;
  appVisible.value = false;
  await handleCoreDown();
}

async function onWindowFocus() {
  if (!appVisible.value) return;
  const healthy = await checkHealth();
  if (!healthy) onCoreDown();
}

function onBroadcast(_: any, msg: any) {
  const event: StreamEvent = {
    type: msg.type as StreamEventType,
    correlationId: msg.correlationId ?? '',
    taskIdentifier: msg.data?.taskIdentifier ?? '',
    pipelineIdentifier: msg.data?.pipelineIdentifier ?? '',
    timestamp: Date.now(),
    data: msg.data,
  };
  streamStore.addEvent(event);
}

onMounted(async () => {
  // Apply locale from localStorage immediately — before init() —
  // so the loading screen shows in the correct language.
  applyLocaleFromStorage();

  window.ipcRenderer.on('stream:broadcast', onBroadcast);
  window.ipcRenderer.on('core:disconnected', onCoreDown);
  window.ipcRenderer.on('core:reconnected', handleCoreBack);
  window.ipcRenderer.on('workspace-unavailable', onWorkspaceUnavailable);
  window.ipcRenderer.on('app-update:ready', onAppUpdateReady);
  window.addEventListener('focus', onWindowFocus);
  pendingAppUpdate.value = await window.ipcRenderer.invoke(SEND.APP_UPDATE_STATE);
  await init();
  // Confirm locale and timezone from the settings store (keeps both in sync with localStorage).
  // Empty when settings never loaded or it was never chosen: what's stored here stays, or an
  // error screen would switch language and the saved choice would be lost.
  const language = settingsStore.get('language');
  if (language) applyStoredLocale(language);
  applyStoredTimezone(settingsStore.get('timezone'));
});

onUnmounted(() => {
  window.ipcRenderer.off('stream:broadcast', onBroadcast);
  window.ipcRenderer.off('core:disconnected', onCoreDown);
  window.ipcRenderer.off('core:reconnected', handleCoreBack);
  window.ipcRenderer.off('workspace-unavailable', onWorkspaceUnavailable);
  window.ipcRenderer.off('app-update:ready', onAppUpdateReady);
  window.removeEventListener('focus', onWindowFocus);
});

const layouts = {
  DefaultLayout,
  EditLayout,
  BuilderLayout,
  StandaloneLayout,
} as const;

type LayoutKey = keyof typeof layouts;

const currentLayout = computed(() => {
  const layoutKey = route.meta.layout as LayoutKey | undefined;
  return layoutKey && layouts[layoutKey] ? layouts[layoutKey] : DefaultLayout;
});
</script>

<template>
  <Loader v-if="!appVisible" :status-key="statusKey" :error-text="errorText" :ready="ready" :update-version="pendingAppUpdate" @done="appVisible = true" @retry="init()" @install-update="installAppUpdate" />
  <template v-if="appVisible">
    <component :is="currentLayout">
      <router-view />
    </component>
    <NewTaskDialog />
    <NewAppDialog />
    <Toaster />
  </template>
</template>

<style>
/* Two buttons beside the text would squeeze it into a narrow column, so they get their own row. */
.core-stop-toast {
  flex-wrap: wrap;
}
.core-stop-toast [data-content] {
  flex: 1 1 calc(100% - 2rem);
}
.core-stop-toast [data-cancel] {
  margin-left: auto;
}
.core-stop-toast [data-button] {
  margin-top: 0.25rem;
}
</style>

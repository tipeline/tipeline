import { ref } from 'vue';
import { useSettingsStore } from '@/store/settingsStore';
import { SEND } from '@/ipc-channels';
import { generateIdentifier } from '@tipeline/utils';

export type InitStatus = 'ok' | 'error';

export interface CoreUpdateOffer {
  running?: string;
  bundled?: string;
  activeRuns?: number;
}

export interface DesktopOutdatedNotice {
  running?: string;
  bundled?: string;
}

export function useAppInit() {
  const ready = ref(false);
  const statusKey = ref('');
  const errorText = ref('');
  const coreStatus = ref<InitStatus | null>(null);
  const settingsStatus = ref<InitStatus | null>(null);
  // An outdated Core that wasn't restarted on its own: the user decides.
  const coreUpdateOffer = ref<CoreUpdateOffer | null>(null);
  // The running Core is newer than this app: only updating the app helps.
  const desktopOutdated = ref<DesktopOutdatedNotice | null>(null);
  // Auto-start was just turned on for the first time: the user gets told once.
  const autoStartNotice = ref(false);
  // Tried once per session, so a restart that changes nothing can't loop.
  let autoRestartTried = false;

  const settingsStore = useSettingsStore();

  const MIN_DISPLAY_MS = 2000;

  async function pingCore(): Promise<void> {
    await window.ipcRenderer.invoke(SEND.STATUS, {
      correlationId: generateIdentifier(),
      payload: {},
    });
  }

  /** Restarts an outdated Core when no run would be interrupted, otherwise offers it. */
  async function handleOutdatedCore(): Promise<void> {
    let check: (CoreUpdateOffer & { outdated: boolean; desktopOutdated?: boolean; unsupervised?: boolean }) | undefined;
    try {
      check = await window.ipcRenderer.invoke(SEND.CORE_VERSION_CHECK);
    } catch (err) {
      console.error('[useAppInit] CORE_VERSION_CHECK failed:', err);
    }
    // Nothing to restart: the Core this app would start instead is the older one.
    if (check?.desktopOutdated) {
      desktopOutdated.value = { running: check.running, bundled: check.bundled };
      return;
    }
    if (!check?.outdated && !check?.unsupervised) return;

    const { running, bundled, activeRuns } = check;
    if (activeRuns === 0 && !autoRestartTried) {
      autoRestartTried = true;
      statusKey.value = 'loader.updatingCore';
      const result = await window.ipcRenderer.invoke(SEND.CORE_RESTART);
      if (result?.restarted) return;
    }
    // An unsupervised Core that's up to date just waits for a quiet moment.
    if (check.outdated) coreUpdateOffer.value = { running, bundled, activeRuns };
  }

  async function init(): Promise<void> {
    ready.value = false;
    errorText.value = '';
    coreStatus.value = null;
    settingsStatus.value = null;
    coreUpdateOffer.value = null;
    desktopOutdated.value = null;

    const minDisplay = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_DISPLAY_MS)
    );

    statusKey.value = 'loader.checkingCore';
    let wasRunning = true;
    let databaseNewer = false;
    try {
      console.log('[useAppInit] invoking CORE_LAUNCH...');
      const result = await window.ipcRenderer.invoke(SEND.CORE_LAUNCH);
      wasRunning = result?.wasRunning ?? true;
      databaseNewer = result?.databaseNewer ?? false;
      if (result?.autoStartTurnedOn) autoStartNotice.value = true;
      console.log('[useAppInit] CORE_LAUNCH result:', result);
    } catch (err) {
      console.error('[useAppInit] CORE_LAUNCH failed:', err);
      // If the handler itself fails, proceed optimistically
    }

    // Retrying can't help, and the generic message would blame the install.
    if (databaseNewer) {
      coreStatus.value = 'error';
      await minDisplay;
      errorText.value = 'loader.databaseNewer';
      return;
    }

    if (!wasRunning) {
      statusKey.value = 'loader.startingCore';
    }

    try {
      console.log('[useAppInit] invoking STATUS...');
      await pingCore();
      console.log('[useAppInit] STATUS ok');
      // A Core this launch just started is the bundled one.
      if (wasRunning) {
        await handleOutdatedCore();
        await pingCore();
      }
      coreStatus.value = 'ok';
    } catch (err) {
      console.error('[useAppInit] STATUS failed:', err);
      coreStatus.value = 'error';
    }

    if (coreStatus.value === 'error') {
      await minDisplay;
      errorText.value = 'loader.coreDown';
      return;
    }

    statusKey.value = 'loader.loadingSettings';
    try {
      await settingsStore.load();
      settingsStatus.value = 'ok';
    } catch {
      settingsStatus.value = 'error';
    }

    await minDisplay;
    ready.value = true;
  }

  /** The user accepted the offer: restart, then load everything again. */
  async function restartCore(): Promise<void> {
    ready.value = false;
    errorText.value = '';
    statusKey.value = 'loader.updatingCore';
    await window.ipcRenderer.invoke(SEND.CORE_RESTART);
    await init();
  }

  async function checkHealth(): Promise<boolean> {
    try {
      await pingCore();
      return true;
    } catch {
      return false;
    }
  }

  /** Core went away. It may come back by itself, and the screen shouldn't blame the install. */
  async function handleCoreDown(): Promise<void> {
    // Set before waiting, so a reconnect that beats the reply still finds an error to clear.
    triggerError('loader.coreDown');
    try {
      const autoStart = await window.ipcRenderer.invoke(SEND.AUTO_START_GET);
      if (autoStart?.enabled && autoStart.restartsOnCrash && errorText.value === 'loader.coreDown') {
        errorText.value = 'loader.coreReconnecting';
      }
    } catch {
      // keep the plain message
    }
  }

  /** Core is reachable again, whoever started it: leave the error screen without a click. */
  async function handleCoreBack(): Promise<void> {
    if (errorText.value) await init();
  }

  function triggerError(key: string): void {
    ready.value = false;
    errorText.value = key;
  }

  return {
    ready,
    statusKey,
    errorText,
    coreStatus,
    settingsStatus,
    coreUpdateOffer,
    desktopOutdated,
    autoStartNotice,
    init,
    restartCore,
    handleCoreDown,
    handleCoreBack,
    checkHealth,
    triggerError,
  };
}

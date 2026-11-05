import { useSettingsStore } from '@/store/settingsStore';

export type WorkflowPlatform = 'windows' | 'linux' | 'macos';

export interface SystemInfo {
  platform: WorkflowPlatform | null;
  username: string;
}

// Settings keys (Settings → Defaults).
export const DEFAULT_AUTHOR_KEY = 'defaultAuthor';
export const DEFAULT_PLATFORM_CURRENT_KEY = 'defaultPlatformCurrent';

let systemInfo: Promise<SystemInfo> | null = null;

/** This computer's platform and account name, asked once from the main process. */
export function getSystemInfo(): Promise<SystemInfo> {
  systemInfo ??= (async () => {
    try {
      const info = await window.ipcRenderer?.invoke('app:system-info');
      return { platform: info?.platform ?? null, username: info?.username ?? '' };
    } catch {
      return { platform: null, username: '' };
    }
  })();
  return systemInfo;
}

/** What the New Workflow / New App dialogs start with. */
export function useNewItemDefaults() {
  const settingsStore = useSettingsStore();

  function author(): string {
    return settingsStore.get(DEFAULT_AUTHOR_KEY).trim();
  }

  /** This computer's platform when Settings asks for it, otherwise none ("works anywhere"). */
  async function platform(): Promise<WorkflowPlatform | undefined> {
    if (settingsStore.get(DEFAULT_PLATFORM_CURRENT_KEY) !== 'true') return undefined;
    return (await getSystemInfo()).platform ?? undefined;
  }

  return { author, platform };
}

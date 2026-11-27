import { useSettingsStore } from '@/store/settingsStore';

export type WorkflowPlatform = 'windows' | 'linux' | 'macos';

export const PLATFORM_OPTIONS = ['windows', 'linux', 'macos'] as const;

/**
 * The "Any platform" choice in platform pickers. Select items can't have an empty value, so
 * this stands in for "no platform" in the UI and is never saved: see {@link platformToSave}.
 */
export const PLATFORM_ANY = 'any';

/** What a picker's value saves as: a platform, or null for "Any platform". */
export function platformToSave(value: string | null | undefined): WorkflowPlatform | null {
  return (PLATFORM_OPTIONS as readonly string[]).includes(value ?? '')
    ? (value as WorkflowPlatform)
    : null;
}

export interface SystemInfo {
  platform: WorkflowPlatform | null;
  username: string;
  /** The account's display name where the OS keeps one (macOS, Linux), else ''. */
  fullName: string;
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
      return {
        platform: info?.platform ?? null,
        username: info?.username ?? '',
        fullName: info?.fullName ?? '',
      };
    } catch {
      return { platform: null, username: '', fullName: '' };
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

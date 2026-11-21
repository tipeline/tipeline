import { ref } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';
import { usePluginStore } from '@/store/pluginStore';
import { useHubUpdatesStore } from '@/store/hubUpdatesStore';

/** Opening a page checks its hubs at most this often; Check for updates always checks. */
const PAGE_OPEN_CHECK_MS = 60_000;

// Shared by every page, so moving between the list and a detail page doesn't check twice.
const lastChecked = new Map<string, number>();

/**
 * Checks hubs from the page that shows their items, so an update shows up (and, with
 * Auto-update on, installs) when someone looks instead of at the next background check.
 * Core shares a check already running for the same hub, so this never installs twice.
 */
export function useHubChecks() {
  const checking = ref(false);
  const pluginStore = usePluginStore();
  const hubUpdates = useHubUpdatesStore();

  /** Returns whether any hub was checked. Failures are left to the Updates log. */
  async function checkHubs(hubIds: (string | null | undefined)[], { force = false } = {}) {
    const now = Date.now();
    const due = [...new Set(hubIds.filter((id): id is string => !!id))].filter(
      (id) => force || now - (lastChecked.get(id) ?? 0) >= PAGE_OPEN_CHECK_MS
    );
    if (!due.length) return false;

    due.forEach((id) => lastChecked.set(id, now));
    checking.value = true;
    try {
      await Promise.allSettled(due.map((hubId) => invokeCore(SEND.HUB_CHECK_ONE, { hubId })));
      await afterPluginChange();
      return true;
    } finally {
      checking.value = false;
    }
  }

  /** A plugin changed in Core: read its actions again and pick up what the log now says. */
  async function afterPluginChange() {
    await Promise.allSettled([pluginStore.loadDefinitions(), hubUpdates.refresh()]);
  }

  return { checking, checkHubs, afterPluginChange };
}

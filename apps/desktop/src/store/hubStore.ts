import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';

export interface Hub {
  id: string;
  name: string;
  type: 'remote' | 'local_folder';
  target: string;
  enabled: boolean;
  last_checked_at: string | null;
  /** Whether an access token is saved. Core never sends the token itself. */
  hasToken: boolean;
}

export const useHubStore = defineStore('hub', () => {
  const hubs = ref<Hub[]>([]);
  const loading = ref(false);

  const enabledHubs = computed(() => hubs.value.filter((h) => h.enabled));

  async function load(): Promise<void> {
    loading.value = true;
    try {
      hubs.value = await invokeCore<Hub[]>(SEND.HUB_LIST);
    } finally {
      loading.value = false;
    }
  }

  async function add(data: {
    name: string;
    type: 'remote' | 'local_folder';
    target: string;
    token?: string;
  }): Promise<Hub> {
    const hub = await invokeCore<Hub>(SEND.HUB_ADD, data);
    hubs.value.push(hub);
    return hub;
  }

  /** A `token` left out keeps the saved one; `null` removes it. */
  async function update(
    id: string,
    data: Partial<{ name: string; target: string; token: string | null }>
  ): Promise<Hub> {
    const hub = await invokeCore<Hub>(SEND.HUB_UPDATE, { id, ...data });
    const idx = hubs.value.findIndex((h) => h.id === id);
    if (idx !== -1) hubs.value[idx] = hub;
    return hub;
  }

  async function remove(id: string): Promise<void> {
    await invokeCore(SEND.HUB_REMOVE, { id });
    hubs.value = hubs.value.filter((h) => h.id !== id);
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const hub = await invokeCore<Hub>(SEND.HUB_SET_ENABLED, { id, enabled });
    const idx = hubs.value.findIndex((h) => h.id === id);
    if (idx !== -1) hubs.value[idx] = hub;
  }

  async function checkOne(id: string): Promise<void> {
    await invokeCore(SEND.HUB_CHECK_ONE, { hubId: id });
    await load();
  }

  return { hubs, loading, enabledHubs, load, add, update, remove, setEnabled, checkOne };
});

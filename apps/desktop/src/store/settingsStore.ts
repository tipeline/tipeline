import { defineStore } from 'pinia';
import { ref } from 'vue';
import { SEND } from '@/ipc-channels';
import { invokeCore } from '@/utils/invoke';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Record<string, string>>({});
  const loading = ref(false);

  async function load() {
    loading.value = true;
    try {
      const result = await invokeCore<Record<string, string>>(SEND.SETTINGS_LIST);
      settings.value = result ?? {};
    } finally {
      loading.value = false;
    }
  }

  async function set(key: string, value: string) {
    await invokeCore(SEND.SETTINGS_SET, { key, value });
    settings.value[key] = value;
  }

  function get(key: string, fallback = '') {
    return settings.value[key] ?? fallback;
  }

  async function getApiToken(): Promise<string> {
    return (await invokeCore<string>(SEND.SETTINGS_GET_API_TOKEN)) ?? '';
  }

  return { settings, loading, load, set, get, getApiToken };
});

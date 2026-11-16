import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useSession } from './session';
import { loadServerList, saveServerList } from './storage';

/** Workflows starred on this phone for Home, per Server (Desktop keeps its own the same way). */
export const useStars = defineStore('mobile-stars', () => {
  const session = useSession();
  const starred = ref<string[]>([]);

  watch(
    () => session.serverUrl,
    (serverUrl) => (starred.value = serverUrl ? loadServerList('stars', serverUrl) : []),
    { immediate: true }
  );

  const isStarred = (identifier: string) => starred.value.includes(identifier);
  function toggle(identifier: string) {
    starred.value = isStarred(identifier) ? starred.value.filter((i) => i !== identifier) : [...starred.value, identifier];
    saveServerList('stars', session.serverUrl, starred.value);
  }

  return { starred, isStarred, toggle };
});

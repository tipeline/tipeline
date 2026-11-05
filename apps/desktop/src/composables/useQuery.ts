import { ref, type Ref } from 'vue';
import { generateIdentifier } from '@tipeline/utils';

/**
 * Fetches data from tipeline-core via ipcRenderer.invoke().
 *
 * Fires immediately when called (during component setup). Returns reactive
 * isLoading and error refs so the template can show loading/error states
 * without additional boilerplate.
 *
 * refetch() can be called at any time to re-run the same query (e.g. after
 * a mutation or when re-entering a page).
 */
export function useQuery<T = any>(channel: string, payload: any = null) {
  const data = ref<T | null>(null) as Ref<T | null>;
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  async function fetch(overridePayload?: any) {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await window.ipcRenderer.invoke(channel, {
        correlationId: generateIdentifier(),
        payload: overridePayload ?? payload,
      });
      data.value = result;
    } catch (e: any) {
      error.value = e?.message ?? 'Unknown error';
    } finally {
      isLoading.value = false;
    }
  }

  // Fire immediately — runs during setup(), before mount
  fetch();

  return { data, isLoading, error, refetch: fetch };
}

import { computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

/**
 * A filter, tab or view that stays as the user left it (on the dashboard unless `area` names
 * another page). Falls back to `fallback` when storage is unavailable or holds a value that is
 * no longer an option.
 */
export function useRememberedChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  area = 'dashboard'
) {
  const stored = useLocalStorage<string>(`tipeline:${area}:${key}`, fallback);
  return computed<T>({
    get: () => (allowed.includes(stored.value as T) ? (stored.value as T) : fallback),
    set: (value) => {
      stored.value = value;
    },
  });
}

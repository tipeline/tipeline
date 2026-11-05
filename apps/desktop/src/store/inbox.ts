import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadForConnection, saveForConnection } from '@/utils/connectionStorage';

/** A failed run the user dismissed from the dashboard inbox. */
export interface DismissedFailure {
  taskIdentifier: string;
  /** The failed run's identifier (or its time when the identifier isn't known). */
  runKey: string;
}

const STORAGE = 'inboxDismissed';
// Old entries only matter while their run is still the workflow's latest, so a short
// list is plenty.
const MAX_ENTRIES = 200;

/**
 * Failures dismissed from the dashboard inbox, per workspace. A dismissal covers one run:
 * the next failed run of the same workflow shows up again, and a successful run clears
 * the workflow from the inbox anyway.
 */
export const useInboxStore = defineStore('inbox', () => {
  const connectionId = ref<string>('local');
  const dismissed = ref<DismissedFailure[]>(loadForConnection<DismissedFailure>(STORAGE, 'local'));

  function switchConnection(id: string | null): void {
    connectionId.value = id ?? 'local';
    dismissed.value = loadForConnection<DismissedFailure>(STORAGE, connectionId.value);
  }

  function isDismissed(taskIdentifier: string, runKey: string): boolean {
    return dismissed.value.some((d) => d.taskIdentifier === taskIdentifier && d.runKey === runKey);
  }

  function dismiss(taskIdentifier: string, runKey: string): void {
    const next = [
      { taskIdentifier, runKey },
      ...dismissed.value.filter((d) => d.taskIdentifier !== taskIdentifier),
    ].slice(0, MAX_ENTRIES);
    dismissed.value = next;
    saveForConnection(STORAGE, connectionId.value, next);
  }

  return { dismissed, switchConnection, isDismissed, dismiss };
});

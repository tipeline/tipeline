import type { InjectionKey } from 'vue';
import type { RunnableState } from '@/composables/useAppRuntime';

/** What widgets may read from the page runtime they're shown in (absent in the builder). */
export const APP_RUNTIME: InjectionKey<{
  appIdentifier: () => string;
  pageId: () => string;
  runnables: Record<string, RunnableState>;
}> = Symbol('appRuntime');

/**
 * Set by the builder around its Preview: a list view reports the items it shows, so
 * the builder can suggest `item.<field>` from real data without running anything.
 */
export const APP_LIST_SAMPLES: InjectionKey<(pageId: string, listId: string, items: unknown[]) => void> =
  Symbol('appListSamples');

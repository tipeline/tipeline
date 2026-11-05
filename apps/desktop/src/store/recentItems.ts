import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadForConnection, saveForConnection } from '@/utils/connectionStorage';

export type RecentItemType = 'task' | 'project' | 'app';

export interface RecentItem {
  type: RecentItemType;
  identifier: string;
  name: string;
  openedAt: string;
  image?: string | null;
}

// Enough to fill the dashboard's two rows even after deleted items are hidden.
const MAX_PER_TYPE = 30;
const STORAGE = 'recentItems';

export const useRecentItemsStore = defineStore('recentItems', () => {
  const connectionId = ref<string>('local');
  const items = ref<RecentItem[]>(loadForConnection<RecentItem>(STORAGE, 'local'));

  function switchConnection(id: string | null): void {
    connectionId.value = id ?? 'local';
    items.value = loadForConnection<RecentItem>(STORAGE, connectionId.value);
  }

  function markOpened(type: RecentItemType, identifier: string, name: string, image?: string | null): void {
    const previous = items.value.find((i) => i.type === type && i.identifier === identifier);
    const filtered = items.value.filter((i) => i !== previous);
    // No picture given (the app builder doesn't load it): keep the one saved before.
    const kept = image === undefined ? previous?.image : image;
    filtered.unshift({ type, identifier, name, image: kept, openedAt: new Date().toISOString() });

    const perTypeCount = new Map<RecentItemType, number>();
    const capped = filtered.filter((i) => {
      const count = perTypeCount.get(i.type) ?? 0;
      if (count >= MAX_PER_TYPE) return false;
      perTypeCount.set(i.type, count + 1);
      return true;
    });

    items.value = capped;
    saveForConnection(STORAGE, connectionId.value, capped);
  }

  function recent(type?: RecentItemType, limit = 8): RecentItem[] {
    const list = type ? items.value.filter((i) => i.type === type) : items.value;
    return list.slice(0, limit);
  }

  /** Drop one entry — after deleting the workflow, app or project it points to. */
  function forget(type: RecentItemType, identifier: string): void {
    const kept = items.value.filter((i) => !(i.type === type && i.identifier === identifier));
    if (kept.length === items.value.length) return;
    items.value = kept;
    saveForConnection(STORAGE, connectionId.value, kept);
  }

  /** Empty the list, or only one type's entries (the Workflows page clears just workflows). */
  function clear(type?: RecentItemType): void {
    const kept = type ? items.value.filter((i) => i.type !== type) : [];
    items.value = kept;
    saveForConnection(STORAGE, connectionId.value, kept);
  }

  return { items, switchConnection, markOpened, recent, forget, clear };
});

export function recentItemPath(item: { type: RecentItemType; identifier: string }): string {
  switch (item.type) {
    case 'task':
      return `/tasks/${item.identifier}`;
    case 'project':
      return `/projects/${item.identifier}`;
    case 'app':
      return `/apps/${item.identifier}`;
  }
}

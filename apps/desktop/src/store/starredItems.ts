import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadForConnection, saveForConnection } from '@/utils/connectionStorage';

export type StarredItemType = 'task' | 'app';

export interface StarredItem {
  type: StarredItemType;
  identifier: string;
  name: string;
  image?: string | null;
  starredAt: string;
}

const STORAGE = 'starredItems';

const sameItem = (a: { type: string; identifier: string }, type: string, identifier: string) =>
  a.type === type && a.identifier === identifier;

/**
 * Workflows and apps the user starred for quick access from the dashboard. Kept per
 * workspace like recent items, in the order the user arranged them; new stars go last.
 */
export const useStarredItemsStore = defineStore('starredItems', () => {
  const connectionId = ref<string>('local');
  const items = ref<StarredItem[]>(loadForConnection<StarredItem>(STORAGE, 'local'));

  function save(next: StarredItem[]): void {
    items.value = next;
    saveForConnection(STORAGE, connectionId.value, next);
  }

  function switchConnection(id: string | null): void {
    connectionId.value = id ?? 'local';
    items.value = loadForConnection<StarredItem>(STORAGE, connectionId.value);
  }

  function isStarred(type: StarredItemType, identifier: string): boolean {
    return items.value.some((i) => sameItem(i, type, identifier));
  }

  function star(type: StarredItemType, identifier: string, name: string, image?: string | null): void {
    if (isStarred(type, identifier)) return;
    save([...items.value, { type, identifier, name, image, starredAt: new Date().toISOString() }]);
  }

  /** Also called after deleting the workflow or app the star points to. */
  function unstar(type: StarredItemType, identifier: string): void {
    const kept = items.value.filter((i) => !sameItem(i, type, identifier));
    if (kept.length !== items.value.length) save(kept);
  }

  function toggle(type: StarredItemType, identifier: string, name: string, image?: string | null): void {
    if (isStarred(type, identifier)) unstar(type, identifier);
    else star(type, identifier, name, image);
  }

  /**
   * Drag-and-drop reorder: put `from` where `to` is. Dropping on an item further down
   * lands after it, further up lands before it — where the user let go.
   */
  function move(from: { type: StarredItemType; identifier: string }, to: { type: StarredItemType; identifier: string }): void {
    const fromIndex = items.value.findIndex((i) => sameItem(i, from.type, from.identifier));
    const toIndex = items.value.findIndex((i) => sameItem(i, to.type, to.identifier));
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = [...items.value];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    save(next);
  }

  return { items, switchConnection, isStarred, star, unstar, toggle, move };
});

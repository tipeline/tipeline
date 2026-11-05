// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { SEND } from '@/ipc-channels';
import { i18n } from '@/i18n';
import { useRecentItemsStore } from '@/store/recentItems';
import HomeRecentItems from '@/components/home/HomeRecentItems.vue';

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await nextTick();
};

const storedKey = 'tipeline:recentItems:local';

describe('recentItems store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('forget drops one entry and saves the rest', () => {
    const store = useRecentItemsStore();
    store.markOpened('task', 't1', 'One');
    store.markOpened('task', 't2', 'Two');
    store.markOpened('app', 't1', 'Same id, other type');

    store.forget('task', 't1');

    expect(store.items.map((i) => `${i.type}:${i.identifier}`)).toEqual(['app:t1', 'task:t2']);
    expect(JSON.parse(localStorage.getItem(storedKey)!)).toHaveLength(2);
  });

  it('clear with a type keeps the other types', () => {
    const store = useRecentItemsStore();
    store.markOpened('task', 't1', 'One');
    store.markOpened('app', 'a1', 'An app');
    store.markOpened('project', 'p1', 'A project');

    store.clear('task');

    expect(store.items.map((i) => `${i.type}:${i.identifier}`)).toEqual(['project:p1', 'app:a1']);
    expect(JSON.parse(localStorage.getItem(storedKey)!)).toHaveLength(2);

    store.clear();
    expect(store.items).toEqual([]);
  });
});

describe('HomeRecentItems', () => {
  let lists: Record<string, unknown>;

  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    lists = {
      [SEND.TASK_LIST]: [{ identifier: 'alive', name: 'Renamed workflow', image: null }],
      [SEND.APP_LIST]: [],
      [SEND.PROJECT_LIST]: [],
    };
    (window as any).ipcRenderer = {
      invoke: vi.fn(async (channel: string) => {
        const result = lists[channel];
        if (result instanceof Error) throw result;
        return result;
      }),
    };
  });
  afterEach(() => {
    delete (window as any).ipcRenderer;
  });

  const cardNames = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('button p.font-medium').map((p) => p.text());

  it('hides entries that no longer exist and shows current names', async () => {
    const store = useRecentItemsStore();
    store.markOpened('task', 'alive', 'Old name');
    store.markOpened('task', 'deleted', 'Deleted workflow');
    store.markOpened('app', 'gone', 'Deleted app');

    const wrapper = mount(HomeRecentItems, { global: { plugins: [i18n] } });
    await flush();

    expect(cardNames(wrapper)).toEqual(['Renamed workflow']);
    // Hidden, not forgotten: another workspace may still have them.
    expect(store.items).toHaveLength(3);
  });

  it('keeps entries of a type whose list failed to load', async () => {
    lists[SEND.APP_LIST] = new Error('core down');
    const store = useRecentItemsStore();
    store.markOpened('app', 'unknown', 'Maybe an app');

    const wrapper = mount(HomeRecentItems, { global: { plugins: [i18n] } });
    await flush();

    expect(cardNames(wrapper)).toEqual(['Maybe an app']);
  });

  it('shows nothing until the lists have loaded', () => {
    (window as any).ipcRenderer.invoke = vi.fn(() => new Promise(() => {}));
    useRecentItemsStore().markOpened('task', 'deleted', 'Deleted workflow');

    const wrapper = mount(HomeRecentItems, { global: { plugins: [i18n] } });

    expect(cardNames(wrapper)).toEqual([]);
  });
});

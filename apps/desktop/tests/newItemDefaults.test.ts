// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// Settings live in Core: record every save, and let a test make one fail.
const saved: { key: string; value: string }[] = [];
let failSaves = false;
vi.mock('@/utils/invoke', () => ({
  invokeCore: vi.fn(async (channel: string, payload?: { key: string; value: string }) => {
    if (channel === 'settingsSet' && payload) {
      if (failSaves) throw new Error('Core is down');
      saved.push(payload);
    }
    return {};
  }),
}));

// getSystemInfo asks once per session, so every test sees the same computer.
Object.defineProperty(window, 'ipcRenderer', {
  value: { invoke: vi.fn(async () => ({ platform: 'macos', username: 'jdoe', fullName: 'Jane Doe' })) },
});

import { useSettingsStore } from '@/store/settingsStore';
import { DEFAULT_AUTHOR_KEY, useNewItemDefaults } from '@/composables/useNewItemDefaults';

function withSettings(settings: Record<string, string>, loaded = true) {
  const store = useSettingsStore();
  store.settings = { ...settings };
  store.loaded = loaded;
  return useNewItemDefaults();
}

describe('new item author', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    saved.length = 0;
    failSaves = false;
  });

  it("suggests the OS account's full name until one is saved", async () => {
    expect(await withSettings({}).suggestedAuthor()).toBe('Jane Doe');
  });

  it('suggests the saved author over the OS name', async () => {
    expect(await withSettings({ [DEFAULT_AUTHOR_KEY]: 'Ana López' }).suggestedAuthor()).toBe('Ana López');
  });

  it('saves the name of the first create as the default', async () => {
    const defaults = withSettings({});
    await defaults.rememberAuthor('  Jose Daniel  ');
    expect(saved).toEqual([{ key: DEFAULT_AUTHOR_KEY, value: 'Jose Daniel' }]);
    expect(defaults.author()).toBe('Jose Daniel');
  });

  it("doesn't change a saved default on later creates", async () => {
    await withSettings({ [DEFAULT_AUTHOR_KEY]: 'Ana López' }).rememberAuthor('Someone Else');
    expect(saved).toEqual([]);
  });

  it('saves nothing for an empty author', async () => {
    await withSettings({}).rememberAuthor('   ');
    await withSettings({}).rememberAuthor(undefined);
    expect(saved).toEqual([]);
  });

  it("saves nothing before settings have loaded (an author may be saved already)", async () => {
    await withSettings({}, false).rememberAuthor('Jose Daniel');
    expect(saved).toEqual([]);
  });

  it("doesn't throw when the save fails: the item is already made", async () => {
    failSaves = true;
    await expect(withSettings({}).rememberAuthor('Jose Daniel')).resolves.toBeUndefined();
  });
});

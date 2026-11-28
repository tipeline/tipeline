// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';

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

import Welcome, { WELCOME_DONE_KEY } from '@/components/Welcome.vue';
import { useSettingsStore } from '@/store/settingsStore';
import { detectSystemLocale, LOCALE_STORAGE_KEY } from '@/composables/useLocale';
import { DEFAULT_PLATFORM_CURRENT_KEY } from '@/composables/useNewItemDefaults';
import { nameFromPasswd } from '@tipeline/utils/accountName';

// getSystemInfo asks once per session, so every test sees the same computer.
vi.stubGlobal('ipcRenderer', {
  invoke: vi.fn(async (channel: string) =>
    channel === 'appVersion' ? '1.2.3' : { platform: 'macos', username: 'jdoe', fullName: 'Jane Doe' }
  ),
});
Object.defineProperty(window, 'ipcRenderer', { value: (globalThis as any).ipcRenderer });

let wrapper: ReturnType<typeof mount> | null = null;

async function mountWelcome(settings: Record<string, string> = {}) {
  useSettingsStore().settings = { ...settings };
  wrapper = mount(Welcome, { global: { plugins: [i18n] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

const submit = async () => {
  await wrapper!.find('form').trigger('submit');
  await flushPromises();
};

describe('Welcome screen', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    saved.length = 0;
    failSaves = false;
    localStorage.clear();
    i18n.global.locale.value = 'en';
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('asks for no name: the language is the only field', async () => {
    await mountWelcome();
    expect(wrapper!.findAll('input:not([type="hidden"])')).toHaveLength(0);
    expect(wrapper!.find('[data-testid="welcome-language"]').exists()).toBe(true);
  });

  it("shows the Desktop app's version", async () => {
    await mountWelcome();
    expect(wrapper!.find('[data-testid="welcome-version"]').text()).toBe('Version 1.2.3');
  });

  it('Get started saves the language and platform, then marks the welcome done last', async () => {
    await mountWelcome();
    await submit();

    expect(saved).toEqual([
      { key: 'language', value: 'en' },
      { key: DEFAULT_PLATFORM_CURRENT_KEY, value: 'true' },
      { key: WELCOME_DONE_KEY, value: 'true' },
    ]);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('leaves a platform choice made in Settings alone', async () => {
    await mountWelcome({ [DEFAULT_PLATFORM_CURRENT_KEY]: 'false' });
    await submit();
    expect(saved.map((s) => s.key)).toEqual(['language', WELCOME_DONE_KEY]);
  });

  it('switches the screen to the picked language before saving, and saves it on Get started', async () => {
    await mountWelcome();
    wrapper!.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'es');
    await flushPromises();
    expect(wrapper!.find('h1').text()).toBe('Te damos la bienvenida a Tipeline');
    expect(saved).toEqual([]);

    await submit();
    expect(saved[0]).toEqual({ key: 'language', value: 'es' });
  });

  it('starts in a language saved before instead of the system one', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    await mountWelcome();
    expect(wrapper!.find('h1').text()).toBe('Te damos la bienvenida a Tipeline');
  });

  it('stays open with a message when saving fails, and can be tried again', async () => {
    await mountWelcome();
    failSaves = true;
    await submit();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper!.find('button[type="submit"]').attributes('disabled')).toBeUndefined();

    failSaves = false;
    await submit();
    expect(saved.at(-1)).toEqual({ key: WELCOME_DONE_KEY, value: 'true' });
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false);
  });
});

describe('detectSystemLocale', () => {
  it('takes the first preferred language Tipeline has', () => {
    expect(detectSystemLocale(['es-MX', 'en-US'])).toBe('es');
    expect(detectSystemLocale(['fr-FR', 'es-ES', 'en'])).toBe('es');
    expect(detectSystemLocale(['EN-gb'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(detectSystemLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectSystemLocale([])).toBe('en');
  });
});

describe('nameFromPasswd', () => {
  it('reads the full name from the comment field', () => {
    expect(nameFromPasswd('jdoe:x:1000:1000:Jane Doe,,,:/home/jdoe:/bin/bash')).toBe('Jane Doe');
  });

  it('is empty when there is no name', () => {
    expect(nameFromPasswd('jdoe:x:1000:1000::/home/jdoe:/bin/bash')).toBe('');
    expect(nameFromPasswd('')).toBe('');
  });
});

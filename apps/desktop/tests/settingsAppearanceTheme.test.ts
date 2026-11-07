// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '@/i18n';

vi.mock('@/utils/invoke', () => ({ invokeCore: vi.fn(async () => ({})) }));

import SettingsAppearancePage from '@/pages/settings/SettingsAppearancePage.vue';

function mockSystemTheme(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? dark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

let wrapper: ReturnType<typeof mount> | null = null;

async function mountPage() {
  wrapper = mount(SettingsAppearancePage, { global: { plugins: [i18n] } });
  await flushPromises();
  return wrapper;
}

const themeButton = (label: string) =>
  wrapper!.findAll('button').find((b) => b.text().trim() === label)!;
const isSelected = (label: string) => themeButton(label).classes().includes('bg-foreground');

describe('Settings → Appearance theme', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.unstubAllGlobals();
  });

  for (const dark of [true, false]) {
    it(`keeps System selected when the OS prefers ${dark ? 'dark' : 'light'}`, async () => {
      mockSystemTheme(dark);
      await mountPage();

      await themeButton('Light').trigger('click');
      await flushPromises();
      expect(isSelected('Light')).toBe(true);

      await themeButton('System').trigger('click');
      await flushPromises();

      expect(isSelected('System')).toBe(true);
      expect(isSelected('Light')).toBe(false);
      expect(isSelected('Dark')).toBe(false);
      // The app still follows the OS.
      expect(document.documentElement.classList.contains('dark')).toBe(dark);
    });
  }

  it('highlights Dark when Dark is picked', async () => {
    mockSystemTheme(false);
    await mountPage();

    await themeButton('Dark').trigger('click');
    await flushPromises();

    expect(isSelected('Dark')).toBe(true);
    expect(isSelected('System')).toBe(false);
  });
});

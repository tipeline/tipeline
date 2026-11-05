import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/store/settingsStore';
import { i18n } from '@/i18n';

export type SupportedLocale = 'en' | 'es';

export const LOCALE_STORAGE_KEY = 'tipeline:locale';

export const SUPPORTED_LANGUAGES: { value: SupportedLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

function isSupported(lang: string): lang is SupportedLocale {
  return SUPPORTED_LANGUAGES.some((l) => l.value === lang);
}

export function useLocale() {
  const { locale } = useI18n({ useScope: 'global' });
  const settingsStore = useSettingsStore();

  const currentLocale = computed(() => locale.value as SupportedLocale);

  async function setLocale(lang: SupportedLocale) {
    locale.value = lang;
    localStorage.setItem(LOCALE_STORAGE_KEY, lang);
    await settingsStore.set('language', lang);
  }

  return { currentLocale, setLocale, SUPPORTED_LANGUAGES };
}

// Reads the locale from localStorage and applies it immediately.
// Safe to call before the settings store is loaded.
export function applyLocaleFromStorage(): void {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY) ?? '';
  (i18n.global.locale as { value: string }).value = isSupported(stored) ? stored : 'en';
}

// Applies a locale value programmatically (e.g. after settings load from core).
export function applyStoredLocale(lang: string): void {
  const resolved = isSupported(lang) ? lang : 'en';
  (i18n.global.locale as { value: string }).value = resolved;
  localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
}

import { createI18n } from 'vue-i18n';
import en from '@tipeline/i18n/locales/en/mobile.json';
import es from '@tipeline/i18n/locales/es/mobile.json';

export type Locale = 'en' | 'es';

/** The first of the phone's languages the app has, else English. */
export function preferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language?.toLowerCase().split('-')[0];
    if (base === 'en' || base === 'es') return base;
  }
  return 'en';
}

const phoneLanguages = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];

export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(phoneLanguages),
  fallbackLocale: 'en',
  messages: { en, es },
});

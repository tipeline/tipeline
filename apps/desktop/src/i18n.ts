import { createI18n } from 'vue-i18n';
import enUi from '@tipeline/i18n/locales/en/ui.json';
import esUi from '@tipeline/i18n/locales/es/ui.json';
import enActions from '@tipeline/i18n/locales/en/actions.json';
import esActions from '@tipeline/i18n/locales/es/actions.json';

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: { ...enUi, actions: enActions },
    es: { ...esUi, actions: esActions },
  },
});

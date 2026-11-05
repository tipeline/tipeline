import i18next, { i18n } from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';
import { SupportedLanguages, SupportedNamespaces } from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const localesDir = path.join(__dirname, '..', 'locales');

export const createI18n = async (
  lng: SupportedLanguages = 'en',
  namespaces: SupportedNamespaces[] = ['steps', 'actions', 'ui']
): Promise<i18n> => {
  const instance = i18next.createInstance();

  await instance.use(Backend).init({
    lng,
    fallbackLng: 'en',
    ns: namespaces,
    defaultNS: namespaces[0],
    backend: {
      loadPath: path.join(localesDir, '{{lng}}', '{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false,
    },
  });

  return instance;
};

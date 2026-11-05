import enValidation from '@tipeline/i18n/locales/en/validation.json';
import esValidation from '@tipeline/i18n/locales/es/validation.json';

const DICTIONARIES: Record<string, Record<string, string>> = {
  en: enValidation,
  es: esValidation,
};

// Same key set used by core (thrown as raw Zod issue keys) and by the Zod
// schemas driving desktop forms (e.g. packages/schemas/src/Var.ts), so both
// core-originated errors and live client-side form validation translate
// through this single dictionary.
export function getValidationDictionary(locale: string): Record<string, string> {
  return DICTIONARIES[locale] ?? enValidation;
}

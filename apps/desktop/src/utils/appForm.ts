import { coreValidations, type AppFormField } from '@tipeline/schemas';
import { parseColor } from './appColor';

export type FormErrors = Record<string, string>;

const fieldSchema = coreValidations.appObject.appFormFieldSchema;

/**
 * A form's fields: the list written in the app, or what its `fields` binding resolved
 * to. Bound entries are checked here (the save-time check can't see them): anything
 * that isn't a valid field, and a second field with a name already used, is left out.
 */
export function formFields(value: unknown): AppFormField[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const fields: AppFormField[] = [];
  for (const entry of value) {
    const parsed = fieldSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.name)) continue;
    seen.add(parsed.data.name);
    fields.push(parsed.data);
  }
  return fields;
}

/** Error message keys (under apps.field) per failing field; empty when the form is valid. */
export function validateForm(
  fields: Array<Pick<AppFormField, 'name' | 'type' | 'required'> & { language?: string }>,
  values: Record<string, unknown>
): FormErrors {
  const errors: FormErrors = {};
  for (const field of fields) {
    const value = values[field.name];
    const empty =
      value == null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (field.type === 'checkbox' && value !== true);
    if (field.required && empty) {
      errors[field.name] = 'required';
      continue;
    }
    const format = formatError(field.type, value, field.language);
    if (format) errors[field.name] = format;
  }
  return errors;
}

// Loose on purpose: something@something.something — the mail server has the last word.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Digits and the usual separators (+ ( ) - . / spaces), with 7 to 15 digits.
const PHONE = /^\+?[\d\s().\-/]+$/;

/**
 * What's wrong with a filled-in value of this type (a key under apps.field.errors),
 * or null. Empty values are fine here — `required` is checked on its own.
 */
export function formatError(type: string | undefined, value: unknown, language?: string): string | null {
  if (value == null || value === '') return null;
  switch (type) {
    case 'code':
      if (language !== 'json' || !String(value).trim()) return null;
      try {
        JSON.parse(String(value));
        return null;
      } catch {
        return 'invalidJson';
      }
    case 'number':
    case 'currency':
      return Number.isNaN(Number(value)) ? 'notANumber' : null;
    case 'color':
      return parseColor(value) ? null : 'invalidColor';
    case 'email':
      return EMAIL.test(String(value).trim()) ? null : 'invalidEmail';
    case 'phone': {
      const text = String(value).trim();
      const digits = text.replace(/\D/g, '').length;
      return PHONE.test(text) && digits >= 7 && digits <= 15 ? null : 'invalidPhone';
    }
    default:
      return null;
  }
}

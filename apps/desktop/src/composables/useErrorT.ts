import { getValidationDictionary } from '@/utils/validationDictionary';
import { useLocale } from './useLocale';

export function useErrorT() {
  const { currentLocale } = useLocale();

  // Replaces any line matching a known validation key (e.g. "task.version.invalid",
  // coming straight from core's raw Zod issues) with translated text in the
  // user's selected language. Lines that don't match a key (plain-English errors
  // like "Task not found: x") pass through unchanged.
  function translateError(message: string): string {
    const dictionary = getValidationDictionary(currentLocale.value);
    return message
      .split('\n')
      .map((line) => dictionary[line.trim()] ?? line)
      .join('\n');
  }

  return { translateError };
}

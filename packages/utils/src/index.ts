import { nanoid } from 'nanoid';

/**
 * Generates a unique identifier using nanoid
 * @returns A URL-safe unique string identifier (21 characters)
 */
export function generateIdentifier(): string {
  // Never starting with "-", which a command line would take for an option.
  let identifier = nanoid(21);
  while (identifier.startsWith('-')) identifier = nanoid(21);
  return identifier;
}

/**
 * Builds a regex matching `{{ name }}` and `{= name =}` references to one
 * variable name, with word boundaries so e.g. "file" doesn't match "fileName".
 */
export function variableTokenRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}|\\{=\\s*${escaped}\\s*=\\}`, 'g');
}

/**
 * True if a variable name is referenced anywhere in an arbitrary value tree
 * (action params, task source, etc). Stringifies non-string values so it can
 * be pointed at a whole object as well as a single field.
 */
export function sourceReferencesVariable(value: unknown, name: string): boolean {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return variableTokenRegex(name).test(text);
}

export * from './markdown';
export * from './conditions';
export * from './legacyColorRules';
export * from './schedule';
export * from './fileName';
export * from './projectDelete';
export * from './version';
export * from './projectMap';

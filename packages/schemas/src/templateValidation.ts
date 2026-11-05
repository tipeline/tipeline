import { z } from 'zod';

const TEMPLATE_TOKEN = /\{\{\s*[\w.]+\s*\}\}|\{=\s*[\w.]+\s*=\}/;

// LiquidJS template string schema — the whole value must be exactly one
// {{ var }} (scalars) or {= var =} (objects/arrays) token. Used for fields
// that must resolve to a typed, non-string value.
export const templateString = z
  .string()
  .refine(
    (val) => /^\{\{\s*[\w.]+\s*\}\}$/.test(val) || /^\{=\s*[\w.]+\s*=\}$/.test(val),
    { message: 'Must be a valid template string (e.g., {{ var }}, {= var =})' }
  );

// A string containing one or more template tokens embedded anywhere within
// literal text, e.g. '{{ host }}/rest-of-the-path' or 'output-{{ name }}.pdf'.
// Used for plain-string fields, where mixing literal text and variables is valid.
export const embeddedTemplateString = z
  .string()
  .refine((val) => TEMPLATE_TOKEN.test(val), {
    message: 'Must contain a template token (e.g., {{ var }}, {= var =})',
  });

// Helper to create a schema that accepts either the actual type OR a LiquidJS
// template string. String schemas (url, path, prompt, etc.) also accept a
// template token embedded within literal text; other typed schemas (objects,
// arrays, enums, numbers, booleans) require the value to be exactly one token.
export function orTemplateString<T extends z.ZodTypeAny>(schema: T) {
  const templateSchema = schema instanceof z.ZodString ? embeddedTemplateString : templateString;
  return z.union([schema, templateSchema]);
}

// Alias for better readability
export const t = orTemplateString;

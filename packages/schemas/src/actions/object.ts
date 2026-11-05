import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'Object',
  icon: 'Braces',
};

// Coerce numbers/strings to string; leave others untouched (validation will fail)
const coerceStrictString = () =>
  z.preprocess(
    (val) => (typeof val === 'number' || typeof val === 'string' ? String(val) : val),
    z.string()
  );

export const validations = {
  parse: createValidationPair(
    {
      runtime: z.object({ text: coerceStrictString() }),
      creation: z.object({ text: coerceStrictString() }),
    },
    {
      label: 'Parse',
      icon: '🧾',
      category: 'parsing',
      description: 'Try to parse string to an object.',
      returns: 'object',
      fieldConfig: { text: { description: 'JSON string to parse into an object.' } },
    }
  ),

  setProperty: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        property: coerceStrictString(),
        value: z.any(),
      }),
      creation: z.object({
        object: z.string().min(1),
        property: coerceStrictString(),
        value: z.any(),
      }),
    },
    {
      label: 'Set property',
      icon: '✏️',
      category: 'object',
      description: 'Set a nested property on an object using a dot/bracket path.',
      returns: 'object',
      fieldConfig: {
        object: { description: 'The object to modify.' },
        property: { description: 'Dot or bracket path to the property (e.g. "user.name" or "items[0].id").' },
        value: { description: 'Value to set at the property path.' },
      },
    }
  ),

  hasProperty: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        property: coerceStrictString(),
      }),
      creation: z.object({
        object: z.string().min(1),
        property: coerceStrictString(),
      }),
    },
    {
      label: 'Has property',
      icon: '🔍',
      category: 'object',
      description: 'Check if a property exists in an object (supports nested paths).',
      returns: 'boolean',
      fieldConfig: {
        object: { description: 'The object to inspect.' },
        property: { description: 'Dot or bracket path to the property to check (e.g. "user.address.city").' },
      },
    }
  ),

  getProperty: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        property: coerceStrictString(),
        defaultValue: z.any().optional(),
      }),
      creation: z.object({
        object: z.string().min(1),
        property: coerceStrictString(),
        defaultValue: z.any().optional(),
      }),
    },
    {
      label: 'Get property',
      icon: '📤',
      category: 'object',
      description: 'Get a property value from an object (supports nested paths and default values).',
      returns: 'any',
      fieldConfig: {
        object: { description: 'The object to read from.' },
        property: { description: 'Dot or bracket path to the property (e.g. "user.name").' },
        defaultValue: { description: 'Value to return if the property does not exist.' },
      },
    }
  ),

  keys: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
      }),
      creation: z.object({
        object: z.string().min(1),
      }),
    },
    {
      label: 'Keys',
      icon: '🔑',
      category: 'object',
      description: 'Get all keys from an object.',
      returns: 'array',
      fieldConfig: { object: { description: 'The object to extract keys from.' } },
    }
  ),

  values: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
      }),
      creation: z.object({
        object: z.string().min(1),
      }),
    },
    {
      label: 'Values',
      icon: '📊',
      category: 'object',
      description: 'Get all values from an object.',
      returns: 'array',
      fieldConfig: { object: { description: 'The object to extract values from.' } },
    }
  ),

  merge: createValidationPair(
    {
      runtime: z.object({
        objects: z.array(z.record(z.any())),
      }),
      creation: z.object({
        objects: z.array(z.string().min(1)),
      }),
    },
    {
      label: 'Merge',
      icon: '🔀',
      category: 'object',
      description: 'Merge multiple objects deeply into a single object.',
      returns: 'object',
      fieldConfig: { objects: { description: 'Array of objects to deep-merge (later entries override earlier ones).' } },
    }
  ),

  pick: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        properties: z.array(coerceStrictString()),
      }),
      creation: z.object({
        object: z.string().min(1),
        properties: z.array(coerceStrictString()),
      }),
    },
    {
      label: 'Pick',
      icon: '🎯',
      category: 'object',
      description: 'Pick specific properties from an object.',
      returns: 'object',
      fieldConfig: {
        object: { description: 'The source object to pick from.' },
        properties: { description: 'List of property keys to include in the result.' },
      },
    }
  ),

  omit: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        properties: z.array(coerceStrictString()),
      }),
      creation: z.object({
        object: z.string().min(1),
        properties: z.array(coerceStrictString()),
      }),
    },
    {
      label: 'Omit',
      icon: '🚫',
      category: 'object',
      description: 'Omit specific properties from an object.',
      returns: 'object',
      fieldConfig: {
        object: { description: 'The source object to omit from.' },
        properties: { description: 'List of property keys to exclude from the result.' },
      },
    }
  ),

  clone: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
      }),
      creation: z.object({
        object: z.string().min(1),
      }),
    },
    {
      label: 'Clone',
      icon: '📋',
      category: 'object',
      description: 'Create a deep copy of an object.',
      returns: 'object',
      fieldConfig: { object: { description: 'The object to deep-clone.' } },
    }
  ),

  entries: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
      }),
      creation: z.object({
        object: z.string().min(1),
      }),
    },
    {
      label: 'Entries',
      icon: '🗂️',
      category: 'object',
      description: 'Get all key-value pairs from an object as an array of [key, value] entries.',
      returns: 'array',
      fieldConfig: { object: { description: 'The object to get entries from.' } },
    }
  ),

  deleteProperty: createValidationPair(
    {
      runtime: z.object({
        object: z.record(z.any()),
        property: coerceStrictString(),
      }),
      creation: z.object({
        object: z.string().min(1),
        property: coerceStrictString(),
      }),
    },
    {
      label: 'Delete property',
      icon: '🗑️',
      category: 'object',
      description: 'Delete a nested property from an object using a dot or bracket path.',
      returns: 'object',
      fieldConfig: {
        object: { description: 'The object to delete a property from.' },
        property: { description: 'Dot or bracket path of the property to delete (e.g. "user.address").' },
      },
    }
  ),
};

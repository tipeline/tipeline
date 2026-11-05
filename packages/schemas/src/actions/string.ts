import { z } from 'zod';
import { createValidationPair } from './../createValidation';

// Coerce numbers/strings to string; leave others untouched (validation will fail)
const coerceStrictString = () =>
  z.preprocess(
    (val) => (typeof val === 'number' || typeof val === 'string' ? String(val) : val),
    z.string()
  );

export const meta = {
  label: 'String',
  icon: 'Type',
};

export const validations = {
  camelCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Camel Case', icon: '🐫', category: 'casing', description: 'Convert to camelCase.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to convert to camelCase.' } },
    }
  ),

  capitalize: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Capitalize',
      icon: '🔠',
      category: 'casing',
      description: 'Uppercase the first character.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to capitalize.' } },
    }
  ),

  endsWith: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
    },
    {
      label: 'Ends With',
      icon: '🔚',
      category: 'search',
      description: 'Check if a string ends with a substring.',
      returns: 'boolean',
      fieldConfig: {
        string: { description: 'The string to test.' },
        search: { description: 'The substring to search for at the end.' },
        position: { description: 'Optional character position to treat as the end of the string.' },
      },
    }
  ),

  encodeHTMLEntities: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'encodeHTMLEntities', icon: '🔐', category: 'encoding', description: 'Escape special characters.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to HTML-encode (e.g. & → &amp;).' } },
    }
  ),

  decodeHTMLEntities: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'decodeHTMLEntities', icon: '🔓', category: 'encoding', description: 'Unescape HTML entities to their original characters.',
      returns: 'string',
      fieldConfig: { string: { description: 'The HTML-encoded string to decode.' } },
    }
  ),

  includes: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
    },
    {
      label: 'Includes', icon: '🔎', category: 'search', description: 'Substring presence test.',
      returns: 'boolean',
      fieldConfig: {
        string: { description: 'The string to search within.' },
        search: { description: 'The substring to look for.' },
        position: { description: 'Optional index to start searching from.' },
      },
    }
  ),

  indexOf: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        search: z.string(),
        position: z.number().optional(),
      }),
    },
    {
      label: 'Index Of', icon: '🧭', category: 'search', description: 'Index of first occurrence.',
      returns: 'number',
      fieldConfig: {
        string: { description: 'The string to search within.' },
        search: { description: 'The substring to find.' },
        position: { description: 'Optional index to start searching from.' },
      },
    }
  ),

  kebabCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Kebab Case', icon: '➖', category: 'casing', description: 'Convert to kebab-case.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to convert to kebab-case.' } },
    }
  ),

  stringify: createValidationPair(
    {
      runtime: z.object({
        value: z.any(),
        pretty: z.boolean().optional().default(false),
        indent: z.number().int().positive().optional().default(2),
      }),
      creation: z.object({
        value: z.any(),
        pretty: z.boolean().optional().default(false),
        indent: z.number().int().positive().optional().default(2),
      }),
    },
    {
      label: 'Stringify',
      icon: '📝',
      category: 'conversion',
      description: 'Convert any value to a string representation.',
      returns: 'string',
      fieldConfig: {
        value: { description: 'The value to stringify.' },
        pretty: { description: 'Whether to pretty-print JSON output.' },
        indent: { description: 'Number of spaces for indentation when pretty is true (default 2).' },
      },
    }
  ),

  lowerFirst: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Lower First',
      icon: '🔡',
      category: 'casing',
      description: 'Lowercase the first character.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to lowercase the first character of.' } },
    }
  ),

  match: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]),
        flag: z.string().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]),
        flag: z.string().optional(),
      }),
    },
    {
      label: 'Match', icon: '🧩', category: 'regex', description: 'Regex match against a string.',
      returns: 'array',
      fieldConfig: {
        string: { description: 'The string to match against.' },
        pattern: { description: 'Regex pattern string or RegExp object.' },
        flag: { description: 'Optional regex flags (e.g. "g" for global, "i" for case-insensitive).' },
      },
    }
  ),

  replace: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        pattern: z.string(),
        replacement: z.string().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        pattern: z.string(),
        replacement: z.string().optional(),
      }),
    },
    {
      label: 'Replace', icon: '✏️', category: 'replace', description: 'Replace first match.',
      returns: 'string',
      fieldConfig: {
        string: { description: 'The string to perform replacement on.' },
        pattern: { description: 'Exact text to find (not a regex).' },
        replacement: { description: 'Replacement string (empty string to delete).' },
      },
    }
  ),

  replaceAll: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        pattern: z.string(),
        replacement: z.string().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        pattern: z.string(),
        replacement: z.string().optional(),
      }),
    },
    {
      label: 'Replace All', icon: '📝', category: 'replace', description: 'Replace all matches.',
      returns: 'string',
      fieldConfig: {
        string: { description: 'The string to perform replacements on.' },
        pattern: { description: 'Exact text to find and replace everywhere (not a regex).' },
        replacement: { description: 'Replacement string.' },
      },
    }
  ),

  search: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]),
      }),
      creation: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]),
      }),
    },
    {
      label: 'Search', icon: '🔎', category: 'regex', description: 'Search using regex/string.',
      returns: 'number',
      fieldConfig: {
        string: { description: 'The string to search in.' },
        pattern: { description: 'Regex pattern or string to search for.' },
      },
    }
  ),

  slice: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        start: z.number(),
        end: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        start: z.number(),
        end: z.number().optional(),
      }),
    },
    {
      label: 'Slice', icon: '✂️', category: 'slice', description: 'Extract a substring by range.',
      returns: 'string',
      fieldConfig: {
        string: { description: 'The string to slice.' },
        start: { description: 'Start index (inclusive).' },
        end: { description: 'End index (exclusive). Omit to slice to the end.' },
      },
    }
  ),

  snakeCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Snake Case', icon: '🐍', category: 'casing', description: 'Convert to snake_case.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to convert to snake_case.' } },
    }
  ),

  split: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        separator: z.string(),
        limit: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        separator: z.string(),
        limit: z.number().optional(),
      }),
    },
    {
      label: 'Split', icon: '🪓', category: 'split', description: 'Split into parts by separator.',
      returns: 'array',
      fieldConfig: {
        string: { description: 'The string to split.' },
        separator: { description: 'Separator string to split on.' },
        limit: { description: 'Optional maximum number of parts to return.' },
      },
    }
  ),

  startCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Start Case',
      icon: '🅰️',
      category: 'casing',
      description: 'Capitalize words with spaces.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to convert to Start Case.' } },
    }
  ),

  startsWith: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        target: z.string(),
        position: z.number().optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        target: z.string(),
        position: z.number().optional(),
      }),
    },
    {
      label: 'Starts With',
      icon: '🔝',
      category: 'search',
      description: 'Check if a string starts with a substring.',
      returns: 'boolean',
      fieldConfig: {
        string: { description: 'The string to test.' },
        target: { description: 'The substring to check for at the start.' },
        position: { description: 'Optional starting index to begin the check.' },
      },
    }
  ),

  toLowerCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'To Lower Case', icon: '🔡', category: 'casing', description: 'Lowercase the string.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to lowercase.' } },
    }
  ),

  toUpperCase: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'To Upper Case', icon: '🔠', category: 'casing', description: 'Uppercase the string.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to uppercase.' } },
    }
  ),

  upperFirst: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Upper First',
      icon: '🔠',
      category: 'casing',
      description: 'Uppercase the first character.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to uppercase the first character of.' } },
    }
  ),

  trim: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Trim',
      icon: '🧹',
      category: 'whitespace',
      description: 'Trim whitespace from both ends.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to trim whitespace from.' } },
    }
  ),

  trimEnd: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Trim End',
      icon: '🧹',
      category: 'whitespace',
      description: 'Trim whitespace from the end.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to trim trailing whitespace from.' } },
    }
  ),

  trimStart: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Trim Start',
      icon: '🧹',
      category: 'whitespace',
      description: 'Trim whitespace from the start.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to trim leading whitespace from.' } },
    }
  ),

  words: createValidationPair(
    {
      runtime: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
      }),
      creation: z.object({
        string: coerceStrictString(),
        pattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
      }),
    },
    {
      label: 'Words',
      icon: '🗂️',
      category: 'tokenize',
      description: 'Split into words (optional regex).',
      returns: 'array',
      fieldConfig: {
        string: { description: 'The string to split into words.' },
        pattern: { description: 'Optional regex pattern to use as the word boundary.' },
      },
    }
  ),

  len: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Length', icon: '🔢', category: 'utility', description: 'String length.',
      returns: 'number',
      fieldConfig: { string: { description: 'The string to measure the length of.' } },
    }
  ),

  substring: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString(), start: z.number(), end: z.number() }),
      creation: z.object({ string: coerceStrictString(), start: z.number(), end: z.number() }),
    },
    {
      label: 'Substring',
      icon: '✂️',
      category: 'slice',
      description: 'Substring with start and end.',
      returns: 'string',
      fieldConfig: {
        string: { description: 'The string to extract a substring from.' },
        start: { description: 'Start index (inclusive).' },
        end: { description: 'End index (exclusive).' },
      },
    }
  ),

  containsRegex: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString(), pattern: z.string() }),
      creation: z.object({ string: coerceStrictString(), pattern: z.string() }),
    },
    {
      label: 'Contains Regex',
      icon: '🧪',
      category: 'regex',
      description: 'Test if regex pattern exists.',
      returns: 'boolean',
      fieldConfig: {
        string: { description: 'The string to test.' },
        pattern: { description: 'Regex pattern string to test against the string.' },
      },
    }
  ),

  format: createValidationPair(
    {
      runtime: z.object({
        template: z.string(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      }),
      creation: z.object({
        template: z.string(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      }),
    },
    {
      label: 'Format',
      icon: '🧵',
      category: 'template',
      description: 'Template string interpolation.',
      returns: 'string',
      fieldConfig: {
        template: { description: 'Template string with {key} placeholders.' },
        values: { description: 'Object mapping placeholder keys to their replacement values.' },
      },
    }
  ),

  parseQueryString: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Parse Query',
      icon: '🔗',
      category: 'query',
      description: 'Parse query string to object.',
      returns: 'object',
      fieldConfig: { string: { description: 'URL query string to parse (e.g. "a=1&b=2").' } },
    }
  ),

  stringifyQueryObject: createValidationPair(
    {
      runtime: z.object({ object: z.record(z.any(), z.any()) }),
      creation: z.object({ object: z.record(z.any(), z.any()) }),
    },
    {
      label: 'Stringify Query',
      icon: '🧾',
      category: 'query',
      description: 'Stringify object to query string.',
      returns: 'string',
      fieldConfig: { object: { description: 'Object of key-value pairs to serialize as a query string.' } },
    }
  ),

  encodeURIComponent: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Encode URI Component',
      icon: '🔐',
      category: 'encoding',
      description: 'Percent-encode a URI component.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to percent-encode for use in a URI.' } },
    }
  ),

  decodeURIComponent: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Decode URI Component',
      icon: '🔓',
      category: 'encoding',
      description: 'Decode a percent-encoded component.',
      returns: 'string',
      fieldConfig: { string: { description: 'The percent-encoded URI component to decode.' } },
    }
  ),

  slugify: createValidationPair(
    {
      runtime: z.object({ string: coerceStrictString() }),
      creation: z.object({ string: coerceStrictString() }),
    },
    {
      label: 'Slugify', icon: '🐌', category: 'casing', description: 'Make a URL-friendly slug.',
      returns: 'string',
      fieldConfig: { string: { description: 'The string to slugify (e.g. "Hello World" → "hello-world").' } },
    }
  ),

  renderTemplate: createValidationPair(
    {
      runtime: z.object({
        template: z.string(),
        data: z.record(z.unknown()).optional().default({}),
      }),
      creation: z.object({
        template: z.string(),
        data: z.union([z.record(z.any()), z.string()]).optional(),
      }),
    },
    {
      label: 'Render Template',
      icon: '🧩',
      category: 'template',
      description: 'Render a Liquid template held in a variable, with the data you give it.',
      returns: 'string',
      fieldConfig: {
        template: {
          description:
            "The template, usually a variable holding it: '{= myTemplate =}'. Text typed here is filled in with the workflow's variables first, so pass templates in a variable.",
        },
        data: { description: 'What the template can use, by name, e.g. { node: {= node =}, site: {= site =} }.' },
      },
    }
  ),

  template: createValidationPair(
    {
      runtime: z.object({
        content: z.string(),
        format: z.enum(['plain', 'html', 'markdown', 'css']).optional().default('plain'),
      }),
      creation: z.object({
        content: z.string(),
        format: z.enum(['plain', 'html', 'markdown', 'css']).optional().default('plain'),
      }),
    },
    {
      label: 'Template',
      icon: '📄',
      category: 'template',
      description: 'Compose a multi-line string using {{ variable }} interpolation.',
      returns: 'string',
      fieldConfig: {
        content: { component: 'codemirror-template', label: 'Content', description: 'The template string with {{ variable }} placeholders.' },
        format: { description: 'Output content format: plain, html, markdown, or css.' },
      },
    }
  ),
};

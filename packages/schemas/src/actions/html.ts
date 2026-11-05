import { z } from 'zod';
import { createValidationPair } from './../createValidation';

// -----------------------------------------------
// Reusable helpers
// -----------------------------------------------

// Attribute guard used by getElement/getElements
const isAttrAllowed = (val: string, extra: string[] = []) =>
  [
    'text',
    'src',
    'id',
    'class',
    'title',
    'href',
    'enabled',
    'visible',
    'exists',
    'ordinal',
    'innerHTML',
    'innerText',
    ...extra,
  ].includes(val) ||
  val.startsWith('data-') ||
  val.startsWith('aria-');

const elementAttribute = (extra: string[] = []) =>
  z
    .string()
    .optional()
    .default('text')
    .refine((val) => isAttrAllowed(val, extra), { message: 'Invalid attribute' });

// Base HTML input (all functions need this)
const htmlInput = z.string().min(1);

// Selector input
const selectorInput = z.string().min(1);

export const meta = {
  label: 'HTML',
  icon: 'Code',
};

export const validations = {
  // -----------------------------
  // Element Extraction
  // -----------------------------

  getElement: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
        attribute: elementAttribute(),
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
        attribute: elementAttribute(),
      }),
    },
    {
      label: 'Get Element',
      icon: '🔍',
      category: 'element',
      description: 'Read an attribute/text from a single element.',
      returns: 'string',
      fieldConfig: {
        html: { description: 'HTML string to parse and query.' },
        selector: { description: 'CSS selector to target the element.' },
        attribute: { description: 'Attribute or property to read (e.g. text, href, src, id).' },
      },
    }
  ),

  getElements: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
        attribute: elementAttribute(),
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
        attribute: elementAttribute(),
      }),
    },
    {
      label: 'Get Elements',
      icon: '🔍',
      category: 'element',
      description: 'Read an attribute/text from multiple elements as array.',
      returns: 'array',
      fieldConfig: {
        html: { description: 'HTML string to parse and query.' },
        selector: { description: 'CSS selector to match multiple elements.' },
        attribute: {
          description: 'Attribute or property to read from each element (e.g. text, href, src).',
        },
      },
    }
  ),

  elementExists: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
      }),
    },
    {
      label: 'Element Exists',
      icon: '❓',
      category: 'element',
      description: 'Check if an element exists in the HTML.',
      returns: 'boolean',
      fieldConfig: {
        html: { description: 'HTML string to search.' },
        selector: { description: 'CSS selector to check for.' },
      },
    }
  ),

  countElements: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
      }),
    },
    {
      label: 'Count Elements',
      icon: '🔢',
      category: 'element',
      description: 'Count the number of elements matching a selector.',
      returns: 'number',
      fieldConfig: {
        html: { description: 'HTML string to search.' },
        selector: { description: 'CSS selector to count matches for.' },
      },
    }
  ),

  // -----------------------------
  // Links & Tables
  // -----------------------------

  getLinks: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: z.string().optional(),
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string().optional(),
      }),
    },
    {
      label: 'Get Links',
      icon: '🔗',
      category: 'extraction',
      description: 'Extract all links (text and href) from HTML.',
      returns: 'array',
      fieldConfig: {
        html: { description: 'HTML string to extract links from.' },
        selector: {
          description: 'Optional CSS selector to scope link extraction (defaults to all anchors).',
        },
      },
    }
  ),

  tableToJson: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
      }),
    },
    {
      label: 'Table to JSON',
      icon: '📊',
      category: 'extraction',
      description: 'Convert an HTML table to an array of objects.',
      returns: 'array',
      fieldConfig: {
        html: { description: 'HTML string containing the table to convert.' },
        selector: { description: 'CSS selector targeting the table element.' },
      },
    }
  ),

  // -----------------------------
  // Structured Data
  // -----------------------------

  extractData: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        schema: z.record(z.string(), z.string()),
      }),
      creation: z.object({
        html: z.string(),
        schema: z.record(z.string(), z.string()),
      }),
    },
    {
      label: 'Extract Data',
      icon: '🧾',
      category: 'extraction',
      description: 'Extract structured data using a schema map of selectors.',
      returns: 'object',
      fieldConfig: {
        html: { description: 'HTML string to extract data from.' },
        schema: {
          description:
            'Object mapping field names to CSS selectors (e.g. { title: "h1", price: ".price" }).',
        },
      },
    }
  ),

  // -----------------------------
  // HTML Manipulation
  // -----------------------------

  removeElements: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
      }),
    },
    {
      label: 'Remove Elements',
      icon: '🗑️',
      category: 'manipulation',
      description: 'Remove elements matching selector and return cleaned HTML.',
      returns: 'string',
      fieldConfig: {
        html: { description: 'HTML string to modify.' },
        selector: { description: 'CSS selector for elements to remove.' },
      },
    }
  ),

  getHtml: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
        outer: z.boolean().optional().default(false),
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
        outer: z.boolean().optional().default(false),
      }),
    },
    {
      label: 'Get HTML',
      icon: '📄',
      category: 'extraction',
      description: 'Get inner or outer HTML of an element.',
      returns: 'string',
      fieldConfig: {
        html: { description: 'HTML string to query.' },
        selector: { description: 'CSS selector targeting the element.' },
        outer: {
          description:
            'If true, returns the outer HTML including the element itself; otherwise inner HTML.',
        },
      },
    }
  ),

  // -----------------------------
  // Search
  // -----------------------------

  findByText: createValidationPair(
    {
      runtime: z.object({
        html: htmlInput,
        selector: selectorInput,
        text: z.string().min(1),
      }),
      creation: z.object({
        html: z.string(),
        selector: z.string(),
        text: z.string(),
      }),
    },
    {
      label: 'Find by Text',
      icon: '🔎',
      category: 'search',
      description: 'Find elements containing specific text.',
      returns: 'array',
      fieldConfig: {
        html: { description: 'HTML string to search.' },
        selector: { description: 'CSS selector to scope the search.' },
        text: { description: 'Text to search for within the matched elements.' },
      },
    }
  ),

  // -----------------------------
  // Conversion
  // -----------------------------

  fromMarkdown: createValidationPair(
    {
      runtime: z.object({
        markdown: z.string().min(1),
        sanitize: z.boolean().optional().default(true),
        inline: z.boolean().optional().default(false),
      }),
      creation: z.object({
        markdown: z.string(),
        sanitize: z.boolean().optional().default(true),
        inline: z.boolean().optional().default(false),
      }),
    },
    {
      label: 'From Markdown',
      icon: '📝',
      category: 'manipulation',
      description: 'Convert Markdown text into HTML.',
      returns: 'string',
      fieldConfig: {
        markdown: { description: 'Markdown source text to convert.' },
        sanitize: {
          description:
            'Strip potentially unsafe HTML (scripts, event handlers) from the output. Enabled by default.',
        },
        inline: {
          description:
            'Render as an inline fragment instead of a full document — skips wrapping the output in block tags like <p> or <h1>. Use for short snippets (e.g. a single line with a link) that will be inserted into existing HTML. Disabled by default.',
        },
      },
    }
  ),
};

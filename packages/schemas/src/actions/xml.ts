import { z } from 'zod';
import { createValidationPair } from './../createValidation';

// -----------------------------------------------
// Reusable helpers
// -----------------------------------------------

// Base XML input (all functions need this)
const xmlInput = z.string().min(1);

export const meta = {
  label: 'XML',
  icon: 'Rss',
};

export const validations = {
  // -----------------------------
  // Parsing
  // -----------------------------

  parse: createValidationPair(
    {
      runtime: z.object({
        xml: xmlInput,
        ignoreAttributes: z.boolean().optional().default(false),
      }),
      creation: z.object({
        xml: z.string(),
        ignoreAttributes: z.boolean().optional().default(false),
      }),
    },
    {
      label: 'Parse XML',
      icon: '🧾',
      category: 'parsing',
      description: 'Parse an XML string into a JSON object.',
      returns: 'object',
      fieldConfig: {
        xml: { description: 'XML string to parse.' },
        ignoreAttributes: {
          description: 'When true, element attributes are stripped from the result (default false).',
        },
      },
    }
  ),

  parseFeed: createValidationPair(
    {
      runtime: z.object({
        xml: xmlInput,
      }),
      creation: z.object({
        xml: z.string(),
      }),
    },
    {
      label: 'Parse Feed (RSS/Atom)',
      icon: '📡',
      category: 'parsing',
      description:
        'Parse an RSS 2.0 or Atom feed into a normalized object with title, link, description, and items.',
      returns: 'object',
      fieldConfig: {
        xml: { description: 'Raw RSS or Atom feed XML content to parse.' },
      },
    }
  ),
};

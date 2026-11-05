import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

const unitEnum = z.enum(['milliseconds', 'seconds', 'minutes', 'hours', 'days']);
const boundaryUnitEnum = z.enum(['day', 'week', 'month', 'year']);

// Accepts either an ISO/parsable string or a native Date (e.g. from a `date`-typed
// variable, which is stored as an actual Date instance) and normalizes to a string.
const dateTimeValue = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

export const meta = {
  label: 'Datetime',
  icon: 'Calendar',
};

export const validations = {
  getCurrentDateTime: createValidationPair(
    {
      runtime: z.object({}),
      creation: z.object({}),
    },
    {
      label: 'Current DateTime',
      icon: '🕒',
      category: 'datetime',
      description: 'Return the current local date & time.',
      returns: 'string',
      fieldConfig: {},
    }
  ),

  nowISO: createValidationPair(
    {
      runtime: z.object({}),
      creation: z.object({}),
    },
    {
      label: 'Now ISO (UTC)',
      icon: '🌐',
      category: 'datetime',
      description: 'Return the current UTC date & time in ISO format',
      returns: 'string',
      fieldConfig: {},
    }
  ),

  toTimestamp: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue }),
      creation: z.object({ dateTime: z.string() }),
    },
    {
      label: 'To Timestamp',
      icon: '🔢',
      category: 'datetime',
      description: 'Convert a date/time string to a Unix timestamp in milliseconds.',
      returns: 'number',
      fieldConfig: { dateTime: { component: 'datestring', description: 'Date/time string to convert (e.g. "2024-01-15T10:30:00").' } },
    }
  ),

  fromTimestamp: createValidationPair(
    {
      runtime: z.object({ timestamp: z.coerce.number() }),
      creation: z.object({ timestamp: orTemplateString(z.number()) }),
    },
    {
      label: 'From Timestamp',
      icon: '📅',
      category: 'datetime',
      description: 'Convert a Unix timestamp (ms) to a Date object.',
      returns: 'string',
      fieldConfig: {
        timestamp: { description: 'Unix timestamp in milliseconds to convert to a Date.' },
      },
    }
  ),

  format: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue, format: z.string() }),
      creation: z.object({ dateTime: z.string(), format: z.string() }),
    },
    {
      label: 'Format',
      icon: '🗓️',
      category: 'datetime',
      description: 'Format a date/time using a pattern.',
      returns: 'string',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The date/time value to format.' },
        format: { description: 'Format pattern string (e.g. "yyyy-MM-dd", "dd/MM/yyyy HH:mm:ss"). Full token list: https://date-fns.org/docs/format' },
      },
    }
  ),

  parseDate: createValidationPair(
    {
      runtime: z.object({ dateString: z.string(), format: z.string() }),
      creation: z.object({ dateString: z.string(), format: z.string() }),
    },
    {
      label: 'Parse Date',
      icon: '🧩',
      category: 'datetime',
      description: 'Parse a date string using a format.',
      returns: 'string',
      fieldConfig: {
        dateString: { component: 'datestring', description: 'The date string to parse.' },
        format: { description: 'Format pattern that describes the input string (e.g. "dd/MM/yyyy"). Full token list: https://date-fns.org/docs/format' },
      },
    }
  ),

  add: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue, duration: z.record(z.string(), z.number()) }),
      creation: z.object({ dateTime: z.string(), duration: orTemplateString(z.record(z.string(), z.number())) }),
    },
    {
      label: 'Add Duration',
      icon: '➕',
      category: 'datetime',
      description: 'Add a duration to a date/time.',
      returns: 'string',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The base date/time to add to.' },
        duration: { description: 'Duration object with time unit keys and numeric values (e.g. { days: 1, hours: 2 }).' },
      },
    }
  ),

  subtract: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue, duration: z.record(z.string(), z.number()) }),
      creation: z.object({ dateTime: z.string(), duration: orTemplateString(z.record(z.string(), z.number())) }),
    },
    {
      label: 'Subtract Duration',
      icon: '➖',
      category: 'datetime',
      description: 'Subtract a duration from a date/time.',
      returns: 'string',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The base date/time to subtract from.' },
        duration: { description: 'Duration object with time unit keys and numeric values (e.g. { days: 1, hours: 2 }).' },
      },
    }
  ),

  startOf: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue, unit: boundaryUnitEnum }),
      creation: z.object({ dateTime: z.string(), unit: orTemplateString(boundaryUnitEnum) }),
    },
    {
      label: 'Start Of',
      icon: '⏪',
      category: 'datetime',
      description: 'Return the start of a day, week, month, or year for a given date.',
      returns: 'string',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The reference date/time.' },
        unit: { description: 'Boundary unit: day, week, month, or year.' },
      },
    }
  ),

  endOf: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue, unit: boundaryUnitEnum }),
      creation: z.object({ dateTime: z.string(), unit: orTemplateString(boundaryUnitEnum) }),
    },
    {
      label: 'End Of',
      icon: '⏩',
      category: 'datetime',
      description: 'Return the end of a day, week, month, or year for a given date.',
      returns: 'string',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The reference date/time.' },
        unit: { description: 'Boundary unit: day, week, month, or year.' },
      },
    }
  ),

  difference: createValidationPair(
    {
      runtime: z.object({
        date1: dateTimeValue,
        date2: dateTimeValue,
        unit: unitEnum,
      }),
      creation: z.object({
        date1: z.string(),
        date2: z.string(),
        unit: orTemplateString(unitEnum),
      }),
    },
    {
      label: 'Difference',
      icon: '📏',
      category: 'datetime',
      description: 'Compute the difference between two date/times in a unit.',
      returns: 'number',
      fieldConfig: {
        date1: { component: 'datestring', description: 'The first (earlier) date/time.' },
        date2: { component: 'datestring', description: 'The second (later) date/time.' },
        unit: { description: 'Unit for the result: milliseconds, seconds, minutes, hours, or days.' },
      },
    }
  ),

  isAfter: createValidationPair(
    {
      runtime: z.object({
        dateTime: dateTimeValue,
        dateTimeToCompare: dateTimeValue,
      }),
      creation: z.object({
        dateTime: z.string(),
        dateTimeToCompare: z.string(),
      }),
    },
    {
      label: 'Is After',
      icon: '⏭️',
      category: 'compare',
      description: 'Check if a date/time is after another.',
      returns: 'boolean',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The date/time to test.' },
        dateTimeToCompare: { component: 'datestring', description: 'The date/time to compare against.' },
      },
    }
  ),

  isBefore: createValidationPair(
    {
      runtime: z.object({
        dateTime: dateTimeValue,
        dateTimeToCompare: dateTimeValue,
      }),
      creation: z.object({
        dateTime: z.string(),
        dateTimeToCompare: z.string(),
      }),
    },
    {
      label: 'Is Before',
      icon: '⏮️',
      category: 'compare',
      description: 'Check if a date/time is before another.',
      returns: 'boolean',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The date/time to test.' },
        dateTimeToCompare: { component: 'datestring', description: 'The date/time to compare against.' },
      },
    }
  ),

  isEqual: createValidationPair(
    {
      runtime: z.object({
        dateTime: dateTimeValue,
        dateTimeToCompare: dateTimeValue,
      }),
      creation: z.object({
        dateTime: z.string(),
        dateTimeToCompare: z.string(),
      }),
    },
    {
      label: 'Is Equal',
      icon: '⚖️',
      category: 'compare',
      description: 'Check if two date/times are equal.',
      returns: 'boolean',
      fieldConfig: {
        dateTime: { component: 'datestring', description: 'The first date/time.' },
        dateTimeToCompare: { component: 'datestring', description: 'The date/time to compare for equality.' },
      },
    }
  ),

  isValid: createValidationPair(
    {
      runtime: z.object({ dateTime: dateTimeValue }),
      creation: z.object({ dateTime: z.string() }),
    },
    {
      label: 'Is Valid',
      icon: '✅',
      category: 'compare',
      description: 'Check if a date/time string represents a valid date.',
      returns: 'boolean',
      fieldConfig: { dateTime: { component: 'datestring', description: 'The date/time string to validate.' } },
    }
  ),
};

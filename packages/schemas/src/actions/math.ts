import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const isLiquidVar = (val: string) =>
  /\{\{\s*[\w.]+\s*\}\}/.test(val) || /\{=\s*[\w.]+\s*=\}/.test(val);

const preNumber = () =>
  z.preprocess(
    (val) => String(val),
    z.string().refine(
      (val) => /^-?\d+(\.\d+)?$/.test(val) || isLiquidVar(val),
      { message: 'Must be a number or a template variable (e.g., {{ var }})' }
    )
  );

const postNumber = () => z.coerce.number();
const postNumberArray = () => z.array(postNumber()).nonempty();

// Creation-time: accepts a concrete array of numbers OR a single LiquidJS template variable
const preNumberArray = () =>
  z.union([
    z.array(preNumber()).nonempty(),
    z.string().refine(isLiquidVar, {
      message: 'Must be a non-empty array of numbers or a template variable (e.g., {{ var }})',
    }),
  ]);

// --------------------------------------------------
// Exported validations
// --------------------------------------------------

export const meta = {
  label: 'Math',
  icon: 'Calculator',
};

export const validations = {
  // -------------------------------------------------------
  // Arithmetic
  // -------------------------------------------------------

  abs: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Absolute', icon: '∣x∣', category: 'arithmetic', description: 'Absolute value.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number to take the absolute value of.' } },
    }
  ),

  add: createValidationPair(
    {
      runtime: z.object({ augend: postNumber(), addend: postNumber() }),
      creation: z.object({
        augend: orTemplateString(z.coerce.number()),
        addend: orTemplateString(z.coerce.number()),
      }),
    },
    {
      label: 'Addition', icon: '➕', category: 'arithmetic', description: 'Adds two numbers.',
      returns: 'number',
      fieldConfig: {
        augend: { description: 'The first number (augend) to add.' },
        addend: { description: 'The second number (addend) to add.' },
      },
    }
  ),

  subtract: createValidationPair(
    {
      runtime: z.object({ minuend: postNumber(), subtrahend: postNumber() }),
      creation: z.object({ minuend: preNumber(), subtrahend: preNumber() }),
    },
    {
      label: 'Subtract',
      icon: '➖',
      category: 'arithmetic',
      description: 'Difference of two numbers.',
      returns: 'number',
      fieldConfig: {
        minuend: { description: 'The number to subtract from.' },
        subtrahend: { description: 'The number to subtract.' },
      },
    }
  ),

  multiply: createValidationPair(
    {
      runtime: z.object({ multiplier: postNumber(), multiplicand: postNumber() }),
      creation: z.object({ multiplier: preNumber(), multiplicand: preNumber() }),
    },
    {
      label: 'Multiply',
      icon: '✖️',
      category: 'arithmetic',
      description: 'Product of two numbers.',
      returns: 'number',
      fieldConfig: {
        multiplier: { description: 'The first number (multiplier).' },
        multiplicand: { description: 'The second number (multiplicand).' },
      },
    }
  ),

  divide: createValidationPair(
    {
      runtime: z.object({
        dividend: postNumber(),
        divisor: postNumber().refine((n) => n !== 0, { message: 'Cannot divide by zero.' }),
      }),
      creation: z.object({ dividend: preNumber(), divisor: preNumber() }),
    },
    {
      label: 'Division',
      icon: '➗',
      category: 'arithmetic',
      description: 'Divides one number by another.',
      returns: 'number',
      fieldConfig: {
        dividend: { description: 'The number to divide (dividend).' },
        divisor: { description: 'The number to divide by (cannot be zero).' },
      },
    }
  ),

  mod: createValidationPair(
    {
      runtime: z.object({
        dividend: postNumber(),
        divisor: postNumber().refine((n) => n !== 0, { message: 'Cannot divide by zero.' }),
      }),
      creation: z.object({ dividend: preNumber(), divisor: preNumber() }),
    },
    {
      label: 'Modulo', icon: '%', category: 'arithmetic', description: 'Remainder after division.',
      returns: 'number',
      fieldConfig: {
        dividend: { description: 'The number to divide (dividend).' },
        divisor: { description: 'The divisor (cannot be zero).' },
      },
    }
  ),

  pow: createValidationPair(
    {
      runtime: z.object({ base: postNumber(), exponent: postNumber() }),
      creation: z.object({ base: preNumber(), exponent: preNumber() }),
    },
    {
      label: 'Power',
      icon: 'xʸ',
      category: 'arithmetic',
      description: 'Raises a base to an exponent.',
      returns: 'number',
      fieldConfig: {
        base: { description: 'The base number.' },
        exponent: { description: 'The exponent to raise the base to.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Rounding
  // -------------------------------------------------------

  ceil: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Ceil',
      icon: '⌈x⌉',
      category: 'rounding',
      description: 'Rounds up to nearest integer.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number to round up.' } },
    }
  ),

  floor: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Floor',
      icon: '⌊x⌋',
      category: 'rounding',
      description: 'Rounds down to nearest integer.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number to round down.' } },
    }
  ),

  round: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Round', icon: '◯', category: 'rounding', description: 'Rounds to nearest integer.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number to round.' } },
    }
  ),

  trunc: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Trunc',
      icon: '[x]',
      category: 'rounding',
      description: 'Truncates toward zero, removing the fractional part.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number to truncate.' } },
    }
  ),

  toFixed: createValidationPair(
    {
      runtime: z.object({
        number: postNumber(),
        digits: z.coerce.number().int().min(0).max(20),
      }),
      creation: z.object({
        number: preNumber(),
        digits: orTemplateString(z.coerce.number().int().min(0).max(20)),
      }),
    },
    {
      label: 'To Fixed',
      icon: '0.00',
      category: 'rounding',
      description: 'Formats a number to a fixed number of decimal places.',
      returns: 'string',
      fieldConfig: {
        number: { description: 'The number to format.' },
        digits: { description: 'Number of decimal places to keep (0–20).' },
      },
    }
  ),

  formatNumber: createValidationPair(
    {
      runtime: z.object({
        number: postNumber(),
        locale: z.string().optional(),
        minimumFractionDigits: z.coerce.number().int().min(0).max(20).optional(),
        maximumFractionDigits: z.coerce.number().int().min(0).max(20).optional(),
      }),
      creation: z.object({
        number: preNumber(),
        locale: z.string().optional(),
        minimumFractionDigits: orTemplateString(z.coerce.number().int().min(0).max(20)).optional(),
        maximumFractionDigits: orTemplateString(z.coerce.number().int().min(0).max(20)).optional(),
      }),
    },
    {
      label: 'Format Number',
      icon: '#,##0',
      category: 'rounding',
      description: 'Locale-aware number formatting via Intl.NumberFormat.',
      returns: 'string',
      fieldConfig: {
        number: { description: 'The number to format.' },
        locale: { description: 'BCP 47 locale string (e.g. "en-US", "de-DE"). Defaults to system locale.' },
        minimumFractionDigits: { description: 'Minimum number of decimal digits to display.' },
        maximumFractionDigits: { description: 'Maximum number of decimal digits to display.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Aggregates
  // -------------------------------------------------------

  max: createValidationPair(
    {
      runtime: z.object({ array: postNumberArray() }),
      creation: z.object({ array: preNumberArray() }),
    },
    {
      label: 'Max', icon: '⬆️', category: 'aggregates', description: 'Largest number in an array.',
      returns: 'number',
      fieldConfig: { array: { description: 'Array of numbers to find the maximum of.' } },
    }
  ),

  mean: createValidationPair(
    {
      runtime: z.object({ array: postNumberArray() }),
      creation: z.object({ array: preNumberArray() }),
    },
    {
      label: 'Mean', icon: 'x̄', category: 'aggregates', description: 'Average of numbers.',
      returns: 'number',
      fieldConfig: { array: { description: 'Array of numbers to average.' } },
    }
  ),

  min: createValidationPair(
    {
      runtime: z.object({ array: postNumberArray() }),
      creation: z.object({ array: preNumberArray() }),
    },
    {
      label: 'Min',
      icon: '⬇️',
      category: 'aggregates',
      description: 'Smallest number in an array.',
      returns: 'number',
      fieldConfig: { array: { description: 'Array of numbers to find the minimum of.' } },
    }
  ),

  sum: createValidationPair(
    {
      runtime: z.object({ array: z.array(postNumber()) }),
      creation: z.object({ array: preNumberArray() }),
    },
    {
      label: 'Sum', icon: '∑', category: 'aggregates', description: 'Sum of numbers in an array.',
      returns: 'number',
      fieldConfig: { array: { description: 'Array of numbers to sum.' } },
    }
  ),

  median: createValidationPair(
    {
      runtime: z.object({ array: postNumberArray() }),
      creation: z.object({ array: preNumberArray() }),
    },
    {
      label: 'Median',
      icon: 'M̃',
      category: 'aggregates',
      description: 'Middle value of a sorted array of numbers.',
      returns: 'number',
      fieldConfig: { array: { description: 'Array of numbers to find the median of.' } },
    }
  ),

  // -------------------------------------------------------
  // Utility
  // -------------------------------------------------------

  clamp: createValidationPair(
    {
      runtime: z.object({ value: postNumber(), min: postNumber(), max: postNumber() }),
      creation: z.object({ value: preNumber(), min: preNumber(), max: preNumber() }),
    },
    {
      label: 'Clamp',
      icon: '⟂',
      category: 'utility',
      description: 'Constrains a number between a minimum and maximum.',
      returns: 'number',
      fieldConfig: {
        value: { description: 'The number to clamp.' },
        min: { description: 'Lower bound (inclusive).' },
        max: { description: 'Upper bound (inclusive).' },
      },
    }
  ),

  percentage: createValidationPair(
    {
      runtime: z.object({
        value: postNumber(),
        total: postNumber().refine((n) => n !== 0, { message: 'Total cannot be zero.' }),
      }),
      creation: z.object({ value: preNumber(), total: preNumber() }),
    },
    {
      label: 'Percentage',
      icon: '%',
      category: 'utility',
      description: 'Calculates what percentage a value is of a total.',
      returns: 'number',
      fieldConfig: {
        value: { description: 'The partial value.' },
        total: { description: 'The total value (cannot be zero).' },
      },
    }
  ),

  sign: createValidationPair(
    {
      runtime: z.object({ number: postNumber() }),
      creation: z.object({ number: preNumber() }),
    },
    {
      label: 'Sign',
      icon: '±',
      category: 'utility',
      description: 'Returns -1, 0, or 1 based on the sign of the number.',
      returns: 'number',
      fieldConfig: { number: { description: 'The number whose sign to determine.' } },
    }
  ),

  increment: createValidationPair(
    {
      runtime: z.object({ number: postNumber(), step: postNumber().optional() }),
      creation: z.object({ number: preNumber(), step: preNumber().optional() }),
    },
    {
      label: 'Increment',
      icon: '+1',
      category: 'utility',
      description: 'Increases a number by a step (default 1).',
      returns: 'number',
      fieldConfig: {
        number: { description: 'The number to increment.' },
        step: { description: 'Amount to increment by (default 1).' },
      },
    }
  ),

  decrement: createValidationPair(
    {
      runtime: z.object({ number: postNumber(), step: postNumber().optional() }),
      creation: z.object({ number: preNumber(), step: preNumber().optional() }),
    },
    {
      label: 'Decrement',
      icon: '-1',
      category: 'utility',
      description: 'Decreases a number by a step (default 1).',
      returns: 'number',
      fieldConfig: {
        number: { description: 'The number to decrement.' },
        step: { description: 'Amount to decrement by (default 1).' },
      },
    }
  ),

  inRange: createValidationPair(
    {
      runtime: z.object({ value: postNumber(), min: postNumber(), max: postNumber() }),
      creation: z.object({ value: preNumber(), min: preNumber(), max: preNumber() }),
    },
    {
      label: 'In Range',
      icon: '∈',
      category: 'utility',
      description: 'Returns true if value is between min and max (inclusive).',
      returns: 'boolean',
      fieldConfig: {
        value: { description: 'The number to test.' },
        min: { description: 'Lower bound (inclusive).' },
        max: { description: 'Upper bound (inclusive).' },
      },
    }
  ),

  // -------------------------------------------------------
  // Generators
  // -------------------------------------------------------

  random: createValidationPair(
    {
      runtime: z.object({ min: postNumber().optional(), max: postNumber().optional() }),
      creation: z.object({ min: preNumber().optional(), max: preNumber().optional() }),
    },
    {
      label: 'Random',
      icon: '🎲',
      category: 'generators',
      description: 'Random number in [min, max) — min and max are optional.',
      returns: 'number',
      fieldConfig: {
        min: { description: 'Minimum value (inclusive). Defaults to 0.' },
        max: { description: 'Maximum value (exclusive). Defaults to 1.' },
      },
    }
  ),
};

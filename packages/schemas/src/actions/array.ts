import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';
import {
  compareAsSchema,
  conditionFieldConfig,
  conditionOperatorSchema,
  refineCondition,
} from './../condition';

export const meta = {
  label: 'Array',
  icon: 'List',
};

// Coerce numbers/strings to string; leave others untouched
const coerceStrictString = () =>
  z.preprocess(
    (val) => (typeof val === 'number' || typeof val === 'string' ? String(val) : val),
    z.string()
  );

// find / filter / some / every / count check each element (or one of its
// properties) with the same condition engine as If: `compareAs` says how to read
// both sides, `operator` the comparison (see @tipeline/utils conditions).
const conditionShape = {
  key: z.string().optional(),
  compareAs: compareAsSchema,
  operator: conditionOperatorSchema,
  value: z.any(),
  ignoreCase: z.boolean().optional(),
};

const conditionFields = {
  key: {
    description:
      'Property path to read from each element (e.g. "address.city"). Omit to compare the element itself.',
  },
  ...conditionFieldConfig,
  value: {
    description:
      'What to compare each element (or element property) with. An element whose value can\'t be read as the chosen type doesn\'t match.',
  },
};

export const validations = {
  // -------------------------------------------------------
  // Parsing
  // -------------------------------------------------------

  parse: createValidationPair(
    {
      runtime: z.object({
        text: coerceStrictString(),
        separator: z.string().default(','),
        type: z.enum(['json', 'csv', 'lines', 'custom']).default('json'),
        trim: z.boolean().default(true),
        elementType: z.enum(['string', 'number', 'boolean', 'auto']).default('string'),
      }),
      creation: z.object({
        text: coerceStrictString(),
        separator: orTemplateString(z.string()).optional(),
        type: z.enum(['json', 'csv', 'lines', 'custom']).optional(),
        trim: z.boolean().optional(),
        elementType: z.enum(['string', 'number', 'boolean', 'auto']).optional(),
      }),
    },
    {
      label: 'Parse',
      icon: '🧾',
      category: 'parsing',
      description: 'Parse string to an array with optional element type conversion.',
      returns: 'array',
      fieldConfig: {
        text: { description: 'The string to parse into an array.' },
        separator: { description: 'Delimiter character used to split the string (default comma).' },
        type: { description: 'Parsing format: json, csv, lines, or custom separator.' },
        trim: { description: 'Whether to trim whitespace from each element.' },
        elementType: {
          description: 'Type to coerce each element to: string, number, boolean, or auto.',
        },
      },
    }
  ),

  // -------------------------------------------------------
  // Conversion
  // -------------------------------------------------------

  toString: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        separator: z.string().default(','),
        format: z.enum(['json', 'csv', 'lines']).default('csv'),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        separator: orTemplateString(z.string()).optional(),
        format: z.enum(['json', 'csv', 'lines']).optional(),
      }),
    },
    {
      label: 'To String',
      icon: '📝',
      category: 'conversion',
      description: 'Convert array to string in various formats.',
      returns: 'string',
      fieldConfig: {
        array: { description: 'The array to convert to a string.' },
        separator: { description: 'Delimiter to join elements with (default comma).' },
        format: { description: 'Output format: json, csv, or lines.' },
      },
    }
  ),

  join: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        separator: z.string().default(','),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())).optional(),
        separator: orTemplateString(z.string()).optional(),
      }),
    },
    {
      label: 'Join',
      icon: '🔗',
      category: 'conversion',
      description: 'Join array elements into a string with separator.',
      returns: 'string',
      fieldConfig: {
        array: { description: 'The array whose elements to join.' },
        separator: { description: 'Delimiter to place between elements (default comma).' },
      },
    }
  ),

  // -------------------------------------------------------
  // Inspection
  // -------------------------------------------------------

  length: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Length',
      icon: '📏',
      category: 'inspection',
      description: 'Get the length of an array.',
      returns: 'number',
      fieldConfig: {
        array: { description: 'The array to measure.' },
      },
    }
  ),

  contains: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        value: z.any(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        value: z.any(),
      }),
    },
    {
      label: 'Contains',
      icon: '🔍',
      category: 'inspection',
      description: 'Check if array contains a specific value.',
      returns: 'boolean',
      fieldConfig: {
        array: { description: 'The array to search in.' },
        value: { description: 'The value to look for in the array.' },
      },
    }
  ),

  indexOf: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        value: z.any(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        value: z.any(),
      }),
    },
    {
      label: 'Index Of',
      icon: '🔎',
      category: 'search',
      description: 'Find the index of first occurrence of a value (-1 if not found).',
      returns: 'number',
      fieldConfig: {
        array: { description: 'The array to search in.' },
        value: { description: 'The value whose index to find.' },
      },
    }
  ),

  get: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        index: z.number().int(),
        defaultValue: z.any().default(null),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        index: orTemplateString(z.number().int()),
        defaultValue: z.any().optional(),
      }),
    },
    {
      label: 'Get Element',
      icon: '🎯',
      category: 'access',
      description: 'Get element at specific index (supports negative indices).',
      returns: 'any',
      fieldConfig: {
        array: { description: 'The array to access.' },
        index: {
          description: 'Zero-based index of the element to retrieve (negative counts from end).',
        },
        defaultValue: { description: 'Value to return if the index is out of bounds.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Modification
  // -------------------------------------------------------

  push: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        value: z.any(),
        position: z.enum(['start', 'end']).default('end'),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        value: z.any(),
        position: z.enum(['start', 'end']).optional(),
      }),
    },
    {
      label: 'Push',
      icon: '➕',
      category: 'modification',
      description: 'Add element to array at start or end.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to add an element to.' },
        value: { description: 'The element to add.' },
        position: { description: 'Where to insert: start or end of the array.' },
      },
    }
  ),

  remove: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        index: z.number().int().min(0),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        index: orTemplateString(z.number().int().min(0)),
      }),
    },
    {
      label: 'Remove',
      icon: '➖',
      category: 'modification',
      description: 'Remove element at specific index.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to remove an element from.' },
        index: { description: 'Zero-based index of the element to remove.' },
      },
    }
  ),

  set: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        index: z.number().int(),
        value: z.any(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        index: orTemplateString(z.number().int()),
        value: z.any(),
      }),
    },
    {
      label: 'Set Element',
      icon: '✏️',
      category: 'modification',
      description: 'Update the element at a specific index (supports negative indices).',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to update.' },
        index: {
          description: 'Zero-based index of the element to replace (negative counts from end).',
        },
        value: { description: 'The new value to set at the given index.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Filtering
  // -------------------------------------------------------

  unique: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Unique',
      icon: '✨',
      category: 'filtering',
      description: 'Get unique values from array (remove duplicates).',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to deduplicate.' },
      },
    }
  ),

  compact: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Compact',
      icon: '🗜️',
      category: 'filtering',
      description: 'Remove falsy values (null, undefined, false, 0, "", NaN).',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to compact by removing all falsy values.' },
      },
    }
  ),

  find: createValidationPair(
    {
      runtime: refineCondition(z.object({ array: z.array(z.any()), ...conditionShape }), 'value'),
      creation: refineCondition(
        z.object({ array: orTemplateString(z.array(z.any())), ...conditionShape }),
        'value'
      ),
    },
    {
      label: 'Find',
      icon: '🔦',
      category: 'filtering',
      description: 'Find the first element matching a condition.',
      returns: 'any',
      fieldConfig: {
        array: { description: 'The array to search.' },
        ...conditionFields,
      },
    }
  ),

  filter: createValidationPair(
    {
      runtime: refineCondition(z.object({ array: z.array(z.any()), ...conditionShape }), 'value'),
      creation: refineCondition(
        z.object({ array: orTemplateString(z.array(z.any())), ...conditionShape }),
        'value'
      ),
    },
    {
      label: 'Filter',
      icon: '🧮',
      category: 'filtering',
      description: 'Keep only the elements that match a condition.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to filter.' },
        ...conditionFields,
      },
    }
  ),

  some: createValidationPair(
    {
      runtime: refineCondition(z.object({ array: z.array(z.any()), ...conditionShape }), 'value'),
      creation: refineCondition(
        z.object({ array: orTemplateString(z.array(z.any())), ...conditionShape }),
        'value'
      ),
    },
    {
      label: 'Some',
      icon: '❓',
      category: 'filtering',
      description: 'Check if at least one element matches a condition.',
      returns: 'boolean',
      fieldConfig: {
        array: { description: 'The array to check.' },
        ...conditionFields,
      },
    }
  ),

  every: createValidationPair(
    {
      runtime: refineCondition(z.object({ array: z.array(z.any()), ...conditionShape }), 'value'),
      creation: refineCondition(
        z.object({ array: orTemplateString(z.array(z.any())), ...conditionShape }),
        'value'
      ),
    },
    {
      label: 'Every',
      icon: '✅',
      category: 'filtering',
      description: 'Check if all elements match a condition.',
      returns: 'boolean',
      fieldConfig: {
        array: { description: 'The array to check.' },
        ...conditionFields,
      },
    }
  ),

  count: createValidationPair(
    {
      runtime: refineCondition(z.object({ array: z.array(z.any()), ...conditionShape }), 'value'),
      creation: refineCondition(
        z.object({ array: orTemplateString(z.array(z.any())), ...conditionShape }),
        'value'
      ),
    },
    {
      label: 'Count',
      icon: '🔢',
      category: 'filtering',
      description: 'Count the elements that match a condition.',
      returns: 'number',
      fieldConfig: {
        array: { description: 'The array to check.' },
        ...conditionFields,
      },
    }
  ),

  // -------------------------------------------------------
  // Grouping
  // -------------------------------------------------------

  pluck: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        key: z.string(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        key: z.string(),
      }),
    },
    {
      label: 'Pluck',
      icon: '🧷',
      category: 'grouping',
      description: 'Extract a single property from each element into a new array.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array of objects to pluck from.' },
        key: { description: 'Property path to extract from each element (e.g. "address.city").' },
      },
    }
  ),

  groupBy: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        key: z.string(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        key: z.string(),
      }),
    },
    {
      label: 'Group By',
      icon: '🗂️',
      category: 'grouping',
      description: 'Group elements into buckets keyed by a property value.',
      returns: 'object',
      fieldConfig: {
        array: { description: 'The array of objects to group.' },
        key: { description: 'Property path to group by (e.g. "status").' },
      },
    }
  ),

  keyBy: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        key: z.string(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        key: z.string(),
      }),
    },
    {
      label: 'Key By',
      icon: '🗝️',
      category: 'grouping',
      description: 'Index elements into an object keyed by a property value (last element wins).',
      returns: 'object',
      fieldConfig: {
        array: { description: 'The array of objects to index.' },
        key: { description: 'Property path to key by (e.g. "id").' },
      },
    }
  ),

  // -------------------------------------------------------
  // Randomization
  // -------------------------------------------------------

  shuffle: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Shuffle',
      icon: '🔀',
      category: 'randomization',
      description: 'Randomize the order of elements in an array.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to shuffle.' },
      },
    }
  ),

  sample: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Sample',
      icon: '🎲',
      category: 'randomization',
      description: 'Pick a single random element from an array.',
      returns: 'any',
      fieldConfig: {
        array: { description: 'The array to sample from.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Transformation
  // -------------------------------------------------------

  chunk: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        size: z.number().int().min(1),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        size: orTemplateString(z.number().int().min(1)),
      }),
    },
    {
      label: 'Chunk',
      icon: '📦',
      category: 'transformation',
      description: 'Split array into chunks of specified size.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to split into chunks.' },
        size: { description: 'Number of elements per chunk.' },
      },
    }
  ),

  flatten: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        depth: z.number().int().min(1).default(1),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        depth: orTemplateString(z.number().int().min(1)).optional(),
      }),
    },
    {
      label: 'Flatten',
      icon: '📄',
      category: 'transformation',
      description: 'Flatten nested arrays to specified depth.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The nested array to flatten.' },
        depth: { description: 'Number of nesting levels to flatten (default 1).' },
      },
    }
  ),

  // -------------------------------------------------------
  // Set Operations
  // -------------------------------------------------------

  intersection: createValidationPair(
    {
      runtime: z.object({
        arrays: z.array(z.array(z.any())).min(1),
      }),
      creation: z.object({
        arrays: z.array(orTemplateString(z.array(z.any()))).min(1),
      }),
    },
    {
      label: 'Intersection',
      icon: '∩',
      category: 'set-operations',
      description: 'Get common elements present in all arrays.',
      returns: 'array',
      fieldConfig: {
        arrays: { description: 'Two or more arrays to intersect.' },
      },
    }
  ),

  union: createValidationPair(
    {
      runtime: z.object({
        arrays: z.array(z.array(z.any())).min(1),
      }),
      creation: z.object({
        arrays: z.array(orTemplateString(z.array(z.any()))).min(1),
      }),
    },
    {
      label: 'Union',
      icon: '∪',
      category: 'set-operations',
      description: 'Combine arrays and get unique elements.',
      returns: 'array',
      fieldConfig: {
        arrays: { description: 'Two or more arrays to combine into a unique set.' },
      },
    }
  ),

  difference: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        exclude: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        exclude: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Difference',
      icon: '−',
      category: 'set-operations',
      description: 'Get elements in first array not present in second array.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The primary array to subtract from.' },
        exclude: { description: 'Array of values to exclude from the primary array.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Sorting
  // -------------------------------------------------------

  sort: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        keys: z.array(z.string()).optional(),
        orders: z.array(z.enum(['asc', 'desc'])).default(['asc']),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        keys: z.array(z.string()).optional(),
        orders: z.array(z.enum(['asc', 'desc'])).optional(),
      }),
    },
    {
      label: 'Sort',
      icon: '🔢',
      category: 'sorting',
      description: 'Sort array by one or more keys with custom order.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to sort.' },
        keys: { description: 'Property keys to sort by (for arrays of objects).' },
        orders: { description: 'Sort direction per key: asc or desc.' },
      },
    }
  ),

  reverse: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
      }),
    },
    {
      label: 'Reverse',
      icon: '🔄',
      category: 'sorting',
      description: 'Reverse the order of array elements.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to reverse.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Extraction
  // -------------------------------------------------------

  slice: createValidationPair(
    {
      runtime: z.object({
        array: z.array(z.any()),
        start: z.number().int().default(0),
        end: z.number().int().optional(),
      }),
      creation: z.object({
        array: orTemplateString(z.array(z.any())),
        start: orTemplateString(z.number().int()).optional(),
        end: orTemplateString(z.number().int()).optional(),
      }),
    },
    {
      label: 'Slice',
      icon: '✂️',
      category: 'extraction',
      description: 'Extract a portion of the array.',
      returns: 'array',
      fieldConfig: {
        array: { description: 'The array to slice.' },
        start: { description: 'Start index (inclusive, default 0).' },
        end: { description: 'End index (exclusive). Omit to slice to the end.' },
      },
    }
  ),

  // -------------------------------------------------------
  // Combining
  // -------------------------------------------------------

  concat: createValidationPair(
    {
      runtime: z.object({
        arrays: z.array(z.array(z.any())).min(1),
      }),
      creation: z.object({
        arrays: z.array(orTemplateString(z.array(z.any()))).min(1),
      }),
    },
    {
      label: 'Concat',
      icon: '🔗',
      category: 'combining',
      description: 'Concatenate multiple arrays into one.',
      returns: 'array',
      fieldConfig: {
        arrays: { description: 'List of arrays to concatenate in order.' },
      },
    }
  ),
};

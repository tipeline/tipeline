import { z } from 'zod';
import { createValidationPair } from './createValidation';
import { variableNameSchema } from './Var';
import {
  dbConnectionSchema,
  sshSchema as sshConnectionSchema,
  browserSchema,
  imageSchema,
  audioSchema,
  videoSchema,
  workbookSchema,
  type VariableScope,
  type VariableVisibility,
  type VariableType,
} from '@tipeline/types';

// --------------------------------------------------
// Variable type schemas
// --------------------------------------------------
export const VariableScopeSchema =
  z.enum(['global', 'task', 'core', 'env'] as const) satisfies z.ZodType<VariableScope>;

export const VariableVisibilitySchema =
  z.enum(['public', 'protected', 'private'] as const) satisfies z.ZodType<VariableVisibility>;

export const VariableTypeSchema = z.enum(
  [
    'string',
    'number',
    'boolean',
    'object',
    'date',
    'array',
    'image',
    'audio',
    'video',
    'dbConnection',
    'sshConnection',
    'browser',
    'workbook',
    'oauthToken',
  ] as const
) satisfies z.ZodType<VariableType>;

export const VariableSchema = z.object({
  type: VariableTypeSchema,
  name: variableNameSchema,
  value: z.any().optional(),
  valueFromEnv: z.string().optional(),
  valueFromEnvFile: z.string().optional(),
  valueFromGlobal: z.string().optional(),
  required: z.boolean().optional().default(false),
  description: z.string().optional(),
  label: z.string().optional(),
  readonly: z.boolean().optional(),
  scope: VariableScopeSchema.optional(),
  secret: z.boolean().optional(),
  visibility: VariableVisibilitySchema.optional(),
  // Filled in by the workflow and returned, never set from outside: not on run forms, not by
  // the assistant, an app or a parent workflow. Who can read it still follows `visibility`.
  output: z.boolean().optional(),
});

// --------------------------------------------------
// Helpers for validation logic
// --------------------------------------------------
const deferredTypes = [
  'dbConnection',
  'sshConnection',
  'browser',
  'image',
  'audio',
  'video',
  'workbook',
  'oauthToken',
] as const;

function isValidTypeValuePair(type: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;

  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && !Array.isArray(value) && value !== null;
    case 'array':
      return Array.isArray(value);
    case 'date':
      if (value instanceof Date) return !isNaN(value.getTime());
      if (typeof value === 'string' || typeof value === 'number') return !isNaN(new Date(value).getTime());
      return false;
    case 'image':
      return imageSchema.safeParse(value).success;
    case 'dbConnection':
      return dbConnectionSchema.safeParse(value).success;
    case 'sshConnection':
      return sshConnectionSchema.safeParse(value).success;
    case 'video':
      return videoSchema.safeParse(value).success;
    case 'audio':
      return audioSchema.safeParse(value).success;
    case 'browser':
      return browserSchema.safeParse(value).success;
    case 'workbook':
      return workbookSchema.safeParse(value).success;
    case 'oauthToken':
      // The token object api.auth returns (access_token, refresh_token, scope, ...).
      return typeof value === 'object' && !Array.isArray(value) && value !== null;
    default:
      return false;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
}

// Names the variable and both types so a mismatch (e.g. an API returning an array into an
// `object` variable) is obvious from the message alone.
function checkValueMatchesType(obj: z.infer<typeof VariableSchema>, ctx: z.RefinementCtx) {
  if (obj.required && obj.value === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Variable "${obj.name}" is required but has no value`,
    });
    return;
  }
  if (obj.value !== undefined && !isValidTypeValuePair(obj.type, obj.value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Variable "${obj.name}" expects ${obj.type} but got ${describeValue(obj.value)}`,
    });
  }
}

// --------------------------------------------------
// Validations (new format)
// --------------------------------------------------
export const validations = {
  create: createValidationPair(
    {
      runtime: VariableSchema.refine(
        (obj) => {
          const isDeferred = (deferredTypes as readonly string[]).includes(obj.type);
          const hasNoValue = obj.value === null || obj.value === undefined;

          // 1) required but missing -> fail
          if (obj.required && hasNoValue) return false;

          // 2) missing but allowed for deferred types -> pass
          if (hasNoValue && isDeferred) return true;

          // 3) value present -> must match type
          if (!hasNoValue && !isValidTypeValuePair(obj.type, obj.value)) return false;

          return true;
        },
        { message: 'Invalid or missing value at creation time' }
      ),
      creation: VariableSchema.refine(
        (obj) => {
          const isDeferred = (deferredTypes as readonly string[]).includes(obj.type);
          const hasNoValue = obj.value === null || obj.value === undefined;

          if (obj.required && hasNoValue) return false;
          if (hasNoValue && isDeferred) return true;
          if (!hasNoValue && !isValidTypeValuePair(obj.type, obj.value)) return false;

          return true;
        },
        { message: 'Invalid or missing value at creation time' }
      ),
    },
    { label: 'Create Variable', icon: '🆕', category: 'variable', description: 'Define a variable and (optionally) assign a value.' }
  ),

  validate: createValidationPair(
    {
      runtime: VariableSchema.superRefine(checkValueMatchesType),
      creation: VariableSchema.superRefine(checkValueMatchesType),
    },
    { label: 'Validate Variable', icon: '✅', category: 'variable', description: 'Validate a variable against its declared type.' }
  ),

  setValue: createValidationPair(
    {
      runtime: z.object({ value: z.any() }),
      creation: z.object({ value: z.any() }),
    },
    { label: 'Set Variable Value', icon: '🏷️', category: 'variable', description: 'Update a variable’s value.' }
  ),
};

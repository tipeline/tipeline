import { z } from 'zod';

// Define the types
export const typeOptions = [
  'string', 'number', 'boolean', 'array', 'date', 'object',
  'browser', 'sshConnection', 'dbConnection', 'workbook', 'oauthToken', 'image', 'audio', 'video',
] as const;
type TypeOption = (typeof typeOptions)[number];

// Global variables round-trip through JSON + SQLite and are shared across
// worker-thread task runs (see apps/core/src/database/services/GlobalVariableService.ts
// and apps/core/src/utils/nonSerializableTypes.ts). Live, non-serializable handles
// (browser, sshConnection, dbConnection, image) can never actually work as a global
// value — they can't survive JSON.stringify or cross a worker_thread boundary — so
// they're excluded here to fail at validation time instead of a circular-JSON crash.
export const globalTypeOptions = [
  'string', 'number', 'boolean', 'array', 'date', 'object',
  'workbook', 'oauthToken', 'audio', 'video',
] as const;
type GlobalTypeOption = (typeof globalTypeOptions)[number];

// Must start with a letter or digit (not "_") so a leading underscore can be
// reserved for engine-internal template references (e.g. `_previous`)
// without ever colliding with a real user-defined variable name.
export const variableNameSchema = z
  .string()
  .min(1, 'variable.name.required')
  .max(128, 'variable.name.maxLength')
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_]*$/, 'variable.name.pattern');

const commonFields = {
  type: z.enum(typeOptions),
  name: variableNameSchema,
  label: z.string().max(128, 'variable.label.maxLength').optional(),
  description: z.string().optional(),
  is_sensitive: z.boolean().default(false),
};

// Create dynamic schema based on selected type
export const createSchema = (type: TypeOption) => {
  const schemas = {
    string: z.object({
      ...commonFields,
      value: z.string().optional(),
    }),
    number: z.object({
      ...commonFields,
      value: z.coerce.number({ invalid_type_error: 'variable.value.invalidNumber' }),
    }),
    boolean: z.object({
      ...commonFields,
      value: z.boolean(),
    }),
    array: z.object({
      ...commonFields,
      value: z.string().optional(),
    }),
    date: z.object({
      ...commonFields,
      value: z.string().optional(),
    }),
    object: z.object({
      ...commonFields,
      value: z.string().optional(),
    }),
    browser: z.object({ ...commonFields }),
    sshConnection: z.object({ ...commonFields }),
    dbConnection: z.object({ ...commonFields }),
    workbook: z.object({ ...commonFields }),
    oauthToken: z.object({ ...commonFields }),
    image: z.object({ ...commonFields }),
    audio: z.object({ ...commonFields }),
    video: z.object({ ...commonFields }),
  };

  return schemas[type];
};

// Global variables (global_variable table) don't take a `label` or
// `visibility` field the way task pipeline variables do — they're shared
// across every task rather than scoped to one, so per-task UI visibility
// doesn't apply. This stays a separate function from createSchema() above
// since the field sets genuinely differ, not just their validation.
const globalCommonFields = {
  type: z.enum(typeOptions),
  name: variableNameSchema,
  description: z.string().optional(),
  secret: z.boolean().optional().default(false),
  readonly: z.boolean().optional().default(false),
};

export const createGlobalSchema = (type: GlobalTypeOption) => {
  const schemas = {
    string: z.object({
      ...globalCommonFields,
      value: z.string().optional(),
    }),
    number: z.object({
      ...globalCommonFields,
      value: z.coerce.number({ invalid_type_error: 'variable.value.invalidNumber' }),
    }),
    boolean: z.object({
      ...globalCommonFields,
      value: z.boolean(),
    }),
    array: z.object({
      ...globalCommonFields,
      value: z.union([z.array(z.unknown()), z.string()]).optional(),
    }),
    date: z.object({
      ...globalCommonFields,
      value: z.string().optional(),
    }),
    object: z.object({
      ...globalCommonFields,
      value: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
    }),
    workbook: z.object({ ...globalCommonFields }),
    oauthToken: z.object({ ...globalCommonFields }),
    audio: z.object({ ...globalCommonFields }),
    video: z.object({ ...globalCommonFields }),
  };

  const schema = schemas[type];
  if (!schema) {
    throw new Error(
      `Variable type "${type}" cannot be used for a global variable — it holds a live, non-serializable handle that can't survive as DB-durable global state.`
    );
  }
  return schema;
};

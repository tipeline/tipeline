// validations/createValidation.ts
import { z, ZodType } from 'zod';
import type { VariableType } from '@tipeline/types';

export type FieldConfig = Record<
  string,
  {
    component?: string;
    label?: string;
    description?: string;
    dialogMode?: 'open' | 'save';
    /** Friendly label per enum value, e.g. { eq: 'Equals' }. Falls back to the raw value when absent. */
    optionLabels?: Record<string, string>;
    /** For `variable-select` fields: restricts the picker to variables of this type. Omit to allow any type. */
    variableType?: string;
    /** For `variable-select` fields: base name suggested when creating a new variable inline (e.g. "index"). */
    suggestedName?: string;
    /** For `codemirror` fields: adds a Run button + Output tab that runs the code as a `script.runScript` step. */
    scriptPreview?: boolean;
    /** For `codemirror` fields: syntax highlighting language. Defaults to JavaScript. */
    language?: 'javascript' | 'sql';
    /** For `record` fields: holds any value (a request body) — Raw JSON also takes arrays/scalars/text, and it opens there. */
    anyJson?: boolean;
  }
>;

export interface ValidationMeta {
  label: string;
  icon: string;
  category: string;
  description: string;
  color?: string;
  fieldConfig?: FieldConfig;
  returns?: VariableType | 'any';
}

export interface Validation<T = any> {
  schema: ZodType<T, any, any>;
  schemaDefinition: () => ZodType<T, any, any>;
  label: string;
  icon: string;
  category: string;
  description: string;
  color?: string;
  fieldConfig?: FieldConfig;
  returns?: VariableType | 'any';
  validate: (data: unknown) => T;
  getDisplayName: () => string;
  withDefaults: (defaults: Record<string, any>) => ZodType<any, any, any>;
}

function addDefaultsWithPreprocess(
  schema: ZodType<any, any, any>,
  defaults: Record<string, any>
): ZodType<any, any, any> {
  // Preprocess the entire object to apply defaults
  return z.preprocess((data: any) => {
    if (!data || typeof data !== 'object') {
      data = {};
    }

    const result = { ...data };

    // Apply defaults for missing or undefined values
    for (const key in defaults) {
      if (defaults[key] !== undefined && (result[key] === undefined || result[key] === null)) {
        result[key] = defaults[key];
      }
    }

    return result;
  }, schema);
}

export const createValidation = <T>(
  schema: ZodType<T, any, any>,
  meta: ValidationMeta
): Validation<T> => ({
  schema,
  schemaDefinition: () => schema,
  ...meta,
  fieldConfig: meta.fieldConfig,
  validate: (data) => schema.parse(data),
  getDisplayName: () => `${meta.icon} ${meta.label}`,
  withDefaults: (defaults: Record<string, any>) => {
    // A refined object (cross-field checks, e.g. conditions) is still an object
    // underneath, so its fields get defaults the same way.
    if (schema instanceof z.ZodObject || (schema instanceof z.ZodEffects && schema.innerType() instanceof z.ZodObject)) {
      // Use the preprocess approach for most reliable default handling
      return addDefaultsWithPreprocess(schema, defaults);
    }
    // If not a ZodObject, return original schema
    console.warn('withDefaults only works with ZodObject schemas');
    return schema;
  },
});

export const createValidationPair = <TRuntime, TCreation = TRuntime>(
  schemas: {
    runtime: ZodType<TRuntime, any, any>;
    creation?: ZodType<TCreation, any, any>;
  },
  meta: ValidationMeta
) => ({
  runtime: createValidation(schemas.runtime, meta),
  creation: schemas.creation
    ? createValidation(schemas.creation, meta)
    : createValidation(schemas.runtime, meta),
  meta,
});

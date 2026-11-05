import { z } from 'zod'

// Define the field interface
// Variable types that require runtime context and cannot be set manually.
// Fields with these types are excluded from editable forms like the task overview.
export const NON_EDITABLE_FIELD_TYPES = [
  'browser',
  'sshConnection',
  'dbConnection',
  'workbook',
  'image',
  'audio',
  'video',
] as const

export interface FormFieldConfig {
  type: 'text' | 'number' | 'email' | 'password' | 'boolean' | 'array' | 'string' | 'object' | 'date' | 'browser' | 'sshConnection' | 'dbConnection' | 'workbook' | 'image' | 'audio' | 'video';
  name: string;
  value?: any;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  readonly?: boolean;
  visibility?: 'public' | 'protected' | 'private';
  /** An output of the workflow: shown nowhere a value is typed in. */
  output?: boolean;
  secret?: boolean;
  valueFromEnv?: string;
  valueFromEnvFile?: string;
  valueFromGlobal?: string;
}

/**
 * A field whose value is resolved by the engine from an environment variable
 * or a global variable — never editable from within a run/build form since
 * anything typed there would be silently discarded at execution time.
 */
export function isExternallySourced(field: Pick<FormFieldConfig, 'valueFromEnv' | 'valueFromGlobal'>): boolean {
  return !!(field.valueFromEnv || field.valueFromGlobal)
}

/**
 * Creates a Zod schema field based on the field type
 */
function createFieldSchema(field: FormFieldConfig): z.ZodTypeAny {
  let fieldSchema: z.ZodTypeAny

  switch (field.type) {
    case 'number':
      fieldSchema = z.number({
        required_error: `${field.label || field.name} is required`,
        invalid_type_error: `${field.label || field.name} must be a number`
      })
      // Add default value if provided
      if (field.value !== undefined && typeof field.value === 'number') {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'text':
    case 'string':
      fieldSchema = z.string({
        required_error: `${field.label || field.name} is required`
      })
      // Add default value if provided
      if (field.value !== undefined && typeof field.value === 'string') {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'email':
      fieldSchema = z.string({
        required_error: `${field.label || field.name} is required`
      }).email('form.email.invalid')
      // Add default value if provided
      if (field.value !== undefined && typeof field.value === 'string') {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'password':
      fieldSchema = z.string({
        required_error: 'form.password.required'
      }).min(8, 'form.password.minLength')
      // Add default value if provided (though uncommon for passwords)
      if (field.value !== undefined && typeof field.value === 'string') {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'boolean':
      fieldSchema = z.boolean({
        required_error: `${field.label || field.name} is required`
      })
      // Add default value if provided
      if (field.value !== undefined && typeof field.value === 'boolean') {
        fieldSchema = fieldSchema.default(field.value)
      }
      if (field.required) {
        fieldSchema = fieldSchema.refine(
          val => val === true,
          `You must accept ${field.label || field.name}`
        )
      }
      break

    case 'object':
      fieldSchema = z.record(z.any())
      if (field.value !== undefined && typeof field.value === 'object' && !Array.isArray(field.value) && field.value !== null) {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'date':
      fieldSchema = z.string({
        required_error: `${field.label || field.name} is required`
      })
      if (field.value !== undefined && typeof field.value === 'string') {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    case 'array':
      // Infer array element type from the value if available
      if (Array.isArray(field.value) && field.value.length > 0) {
        const firstElement = field.value[0]
        if (typeof firstElement === 'number') {
          fieldSchema = z.array(z.number())
        } else if (typeof firstElement === 'string') {
          fieldSchema = z.array(z.string())
        } else {
          fieldSchema = z.array(z.any())
        }
      } else {
        fieldSchema = z.array(z.any())
      }
      // Add default value if provided
      if (field.value !== undefined && Array.isArray(field.value)) {
        fieldSchema = fieldSchema.default(field.value)
      }
      break

    default:
      fieldSchema = z.string({
        required_error: `${field.label || field.name} is required`
      })
      // Add default value if provided
      if (field.value !== undefined && typeof field.value === 'string') {
        fieldSchema = fieldSchema.default(field.value)
      }
  }

  // Make field optional if not required (but only if no default value is set)
  if (!field.required && field.value === undefined) {
    fieldSchema = fieldSchema.optional()
  }

  return fieldSchema
}

/**
 * Creates a complete Zod schema from an array of form field configurations
 */
export function createFormSchema(fields: FormFieldConfig[]): z.ZodObject<any> {
  const schemaObj: Record<string, z.ZodTypeAny> = {}

  fields.forEach(field => {
    if ((NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(field.type)) return
    if (isExternallySourced(field)) return
    schemaObj[field.name] = createFieldSchema(field)
  })

  return z.object(schemaObj)
}

/**
 * Creates field configuration for AutoForm component
 */
export function createFieldConfig(fields: FormFieldConfig[]): Record<string, any> {
  const config: Record<string, any> = {}

  fields.forEach(field => {
    if ((NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(field.type)) return
    const entry: Record<string, any> = {
      label: field.label || field.name,
      description: field.description,
      inputProps: {
        placeholder: field.placeholder || `Enter ${field.label || field.name}`
      },
      fieldType: mapFieldType(field.type),
    }
    if (field.type === 'date') {
      entry.component = 'datestring'
    }
    config[field.name] = entry
  })

  return config
}

/**
 * Maps field types to AutoForm field types
 */
function mapFieldType(type: string): string {
  switch (type) {
    case 'password':
      return 'password'
    case 'email':
      return 'input'
    case 'boolean':
      return 'checkbox'
    case 'object':
      return 'record'
    case 'date':
      return 'datestring'
    case 'array':
      return 'input' // Arrays will be handled as comma-separated strings
    case 'number':
      return 'input'
    case 'text':
    case 'string':
    default:
      return 'input'
  }
}

/**
 * Processes form data to handle special field types (like arrays)
 */
export function processFormData(data: any, fields: FormFieldConfig[]): any {
  const processedData = { ...data }

  fields.forEach(field => {
    if (field.type === 'array' && typeof processedData[field.name] === 'string') {
      // Convert comma-separated string back to array
      processedData[field.name] = processedData[field.name]
        .split(',')
        .map((item: string) => {
          const trimmed = item.trim()
          // Try to convert to number if original array contained numbers
          if (Array.isArray(field.value) && field.value.length > 0 && typeof field.value[0] === 'number') {
            const num = parseFloat(trimmed)
            return isNaN(num) ? trimmed : num
          }
          return trimmed
        })
        .filter((item: any) => item !== '')
    }
  })

  return processedData
}

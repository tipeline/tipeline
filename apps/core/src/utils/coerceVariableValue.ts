import type { VariableType } from '@tipeline/types';

/**
 * Coerces a raw value (often a string — a UI text input, a CLI --variables flag, a
 * subtask.exec `props` entry) to the primitive type a variable declares. Shared by
 * Variable's own construction/setValue and JobExecutor's variable-override
 * application: a caller supplying a loosely-typed override (Desktop's subtask.exec
 * props editor serializes values as strings) would otherwise mutate a raw variable
 * declaration with a value that fails TaskValidator's type-strict schema check before
 * a Variable object — and its own equivalent coercion — ever gets constructed.
 */
export function coerceVariableValue(value: unknown, type: VariableType, name: string): unknown {
  if (value == null) return value;

  try {
    switch (type) {
      case 'string':
        return String(value);
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Cannot convert "${value}" to number`);
        return num;
      }
      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true') return true;
          if (lower === 'false') return false;
          throw new Error(`Cannot convert "${value}" to boolean`);
        }
        return Boolean(value);
      case 'date':
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
          const date = new Date(value);
          if (isNaN(date.getTime())) throw new Error(`Cannot convert "${value}" to date`);
          return date;
        }
        throw new Error(`Cannot convert "${value}" to date`);
      case 'array':
        if (typeof value === 'string') {
          const parsed = JSON.parse(value);
          if (!Array.isArray(parsed)) throw new Error(`JSON value is not an array`);
          return parsed;
        }
        if (!Array.isArray(value)) throw new Error(`value is not an array`);
        return value;
      case 'object':
        if (typeof value === 'string') {
          const parsed = JSON.parse(value);
          if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
            throw new Error(`JSON value is not a plain object`);
          }
          return parsed;
        }
        return value;
      default:
        return value;
    }
  } catch (error: any) {
    throw new Error(`Type coercion failed for variable "${name}": ${error.message}`);
  }
}

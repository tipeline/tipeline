import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { variableNameSchema } from '../Var';

export const meta = {
  label: 'Variable',
  icon: 'Variable'
}

// Allows local variable names (e.g. "myVar") or global references (e.g. "_global.myVar")
const variableSetNameSchema = z
  .string()
  .min(1, 'action.variable.name.required')
  .max(135, 'action.variable.name.maxLength')
  .regex(
    /^(_global\.)?[a-zA-Z0-9][a-zA-Z0-9_]*$/,
    'action.variable.name.pattern'
  );

export const validations = {
  set: createValidationPair(
    {
      runtime: z.object({
        name: variableSetNameSchema,
        value: z.any(),
      }),
      creation: z.object({
        name: variableSetNameSchema,
        value: z.any(),
      }),
    },
    {
      label: 'Set Variable', icon: '🏷️', category: 'variable', description: 'Create or update a pipeline variable.',
      // It writes to the variable in `name` itself; what it returns is only that it did.
      returns: 'boolean',
      fieldConfig: {
        name: { description: 'Variable name (letters, numbers, underscores; prefix with "_global." for global scope).' },
        value: { description: 'Value to assign to the variable.' },
      },
    }
  ),
};

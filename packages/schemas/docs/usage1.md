```ts
// app.ts - Examples of using the validations in your application

import {
  getValidation,
  getGroupValidations,
  getAllValidations,
  getFlatValidations,
  validations,
  flatValidations
} from '@your-package/registry';

// ------------------------------------------------------------
// Method 1: Get a specific validation
// ------------------------------------------------------------
const addValidation = getValidation('math', 'add', 'runtime');

// Use the validation
try {
  const result = addValidation.validate({ augend: 5, addend: 3 });
  console.log('Valid:', result);
} catch (error) {
  console.error('Invalid:', error);
}

// Access metadata
console.log(addValidation.label); // "Addition"
console.log(addValidation.icon); // "➕"
console.log(addValidation.getDisplayName()); // "➕ Addition"

// ------------------------------------------------------------
// Method 2: Get all validations for a group
// ------------------------------------------------------------
const mathValidations = getGroupValidations('math');

// Validate using add operation
const addResult = mathValidations.add.runtime.validate({ augend: 10, addend: 20 });

// Use creation validation for form input
const formData = mathValidations.add.creation.validate({
  augend: "10", // strings from form
  addend: "20"
});

// ------------------------------------------------------------
// Method 3: Use pre-exported validations
// ------------------------------------------------------------
// Access via nested structure
const divideValidation = validations.math.divide.runtime;
const divideResult = divideValidation.validate({ dividend: 10, divisor: 2 });

// Access via flat structure
const multiplyValidation = flatValidations['math.multiply'].runtime;
const multiplyResult = multiplyValidation.validate({ multiplicand: 3, multiplier: 4 });

// ------------------------------------------------------------
// Method 4: Build a dynamic form from validations
// ------------------------------------------------------------
function buildDynamicForm(group: string, action: string) {
  const validation = getValidation(group, action, 'creation');

  return {
    title: validation.label,
    icon: validation.icon,
    description: validation.description,
    fields: Object.keys(validation.schema.shape).map(fieldName => ({
      name: fieldName,
      type: 'text', // You could infer this from the schema
      required: true,
    })),
    onSubmit: (data: any) => {
      // Validate with creation schema
      const validated = validation.validate(data);
      // Convert and validate with runtime schema
      const runtime = getValidation(group, action, 'runtime');
      return runtime.validate(convertToRuntime(validated));
    }
  };
}

// ------------------------------------------------------------
// Method 5: Build UI from all available validations
// ------------------------------------------------------------
function buildActionMenu() {
  const allValidations = getAllValidations();

  const menu = Object.entries(allValidations).map(([group, actions]) => ({
    group,
    items: Object.entries(actions).map(([action, validation]: [string, any]) => ({
      id: `${group}.${action}`,
      label: validation.runtime.label,
      icon: validation.runtime.icon,
      description: validation.runtime.description,
      category: validation.runtime.category,
      onClick: () => executeAction(group, action)
    }))
  }));

  return menu;
}

// ------------------------------------------------------------
// Method 6: Type-safe validation with inference
// ------------------------------------------------------------
import { z } from 'zod';

// Get the inferred types
const mathAdd = validations.math.add.runtime;
type MathAddInput = z.infer<typeof mathAdd.schema>;

// Now you have type safety
const typedInput: MathAddInput = {
  augend: 5,
  addend: 3
  // TypeScript will error if you add wrong properties
};

const typedResult = mathAdd.validate(typedInput);

// ------------------------------------------------------------
// Method 7: Validation with error handling
// ------------------------------------------------------------
function safeValidate(group: string, action: string, data: unknown) {
  try {
    const validation = getValidation(group, action, 'runtime');
    const result = validation.validate(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}

// Usage
const validationResult = safeValidate('math', 'divide', {
  dividend: 10,
  divisor: 0
});

if (!validationResult.success) {
  console.error('Validation failed:', validationResult.errors);
}

// ------------------------------------------------------------
// Method 8: Batch validation
// ------------------------------------------------------------
function validateBatch(operations: Array<{ group: string; action: string; data: unknown }>) {
  return operations.map(op => ({
    ...op,
    result: safeValidate(op.group, op.action, op.data)
  }));
}

// Usage
const batchResults = validateBatch([
  { group: 'math', action: 'add', data: { augend: 5, addend: 3 } },
  { group: 'string', action: 'concat', data: { str1: 'hello', str2: 'world' } },
  { group: 'math', action: 'divide', data: { dividend: 10, divisor: 2 } }
]);
```

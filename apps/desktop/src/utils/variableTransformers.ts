import { Ref } from 'vue';

interface Variable {
  type: string;
  name: string;
  value: any;
  description?: string;
}

type VariableValues = Record<string, any>;

// Main function - works with plain arrays
export function transformVariablesToValues(
  variables: Variable[]
): VariableValues {
  const result: VariableValues = {};
  for (const variable of variables) {
    result[variable.name] = variable.value;
  }
  return result;
}

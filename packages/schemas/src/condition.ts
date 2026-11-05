import { z } from 'zod';
import {
  ALL_CONDITION_OPERATORS,
  CASE_OPERATORS,
  COMPARE_AS,
  COMPARE_AS_LABELS,
  CONDITION_OPERATOR_LABELS,
  CONDITION_OPERATORS,
  operatorAllowed,
  isUnaryOperator,
} from '@tipeline/utils';

// The pieces every condition shares (If / ElseIf / Conditional Loop, the array
// actions, app color rules). Operators and conversion live in @tipeline/utils.

export const compareAsSchema = z.enum(COMPARE_AS, {
  required_error: `Required. How to read the values: ${COMPARE_AS.join(', ')}.`,
  invalid_type_error: `Must be one of: ${COMPARE_AS.join(', ')}.`,
});

export const conditionOperatorSchema = z.enum(ALL_CONDITION_OPERATORS as [string, ...string[]], {
  required_error: 'Required. The comparison to make; the choices depend on "compareAs".',
  invalid_type_error: 'Must be the name of a comparison; the choices depend on "compareAs".',
});

/**
 * Checks what the plain object shape can't: the operator belongs to the chosen
 * type, and binary operators have something to compare with. `compareToKey` is
 * `secondOperand` on flow steps and `value` on array steps / color rules.
 */
export function refineCondition<T extends z.ZodTypeAny>(schema: T, compareToKey: string) {
  return schema.superRefine((data: any, ctx) => {
    if (!data || typeof data !== 'object') return;
    const { compareAs, operator } = data;
    if (!compareAs || !operator) return;
    if (!operatorAllowed(compareAs, operator)) {
      ctx.addIssue({
        path: ['operator'],
        code: z.ZodIssueCode.custom,
        message: `"${CONDITION_OPERATOR_LABELS[operator as keyof typeof CONDITION_OPERATOR_LABELS] ?? operator}" can't compare ${COMPARE_AS_LABELS[compareAs as keyof typeof COMPARE_AS_LABELS]?.toLowerCase() ?? compareAs} values. Use one of: ${CONDITION_OPERATORS[compareAs as keyof typeof CONDITION_OPERATORS].join(', ')}.`,
      });
    }
    if (!isUnaryOperator(operator) && data[compareToKey] === undefined) {
      ctx.addIssue({ path: [compareToKey], code: z.ZodIssueCode.custom, message: 'Required' });
    }
  });
}

/** Field config for the compareAs / operator / ignoreCase fields (labels for the builder). */
export const conditionFieldConfig = {
  compareAs: {
    label: 'Compare as',
    description: 'How both values are read before comparing: text, number, date, boolean, array or object.',
    optionLabels: COMPARE_AS_LABELS as Record<string, string>,
  },
  operator: {
    description: 'The comparison to make. The list depends on "Compare as".',
    optionLabels: CONDITION_OPERATOR_LABELS as Record<string, string>,
  },
  ignoreCase: {
    label: 'Ignore case',
    description: 'Text comparisons treat upper and lower case as the same.',
  },
};

export { CASE_OPERATORS, CONDITION_OPERATORS };

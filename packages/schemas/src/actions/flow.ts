import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';
import {
  compareAsSchema,
  conditionFieldConfig,
  conditionOperatorSchema,
  refineCondition,
} from './../condition';

// --------------------------------------------------
// Helpers
// --------------------------------------------------
const actionsArray = z.array(z.any()).optional();

// firstOperand is required but otherwise unconstrained — after template
// resolution it may hold a string, number, boolean, Date, array, or object
// (e.g. `{= myArrayVar =}` resolves to a live array for compareAs: array).
// secondOperand is optional here; refineCondition requires it for every
// operator that compares with something (not empty, isTrue, ...).
const requiredOperand = z.any().refine((val) => val !== undefined, { message: 'Required' });
const optionalOperand = z.any().optional();

// If / ElseIf / Conditional Loop share one condition: firstOperand, how to read it
// (compareAs), the comparison (operator) and what to compare with (secondOperand).
// See @tipeline/utils conditions for each type's operators.
const conditionShape = {
  firstOperand: requiredOperand,
  compareAs: compareAsSchema,
  operator: conditionOperatorSchema,
  secondOperand: optionalOperand,
  ignoreCase: z.boolean().optional(),
};

const conditionFields = (subject: string) => ({
  firstOperand: { description: `The value to check${subject}.` },
  ...conditionFieldConfig,
  secondOperand: {
    description: 'What to compare with (not used by operators like "is empty" or "is true").',
  },
});

export const meta = {
  label: 'Flow',
  icon: 'Workflow',
};

export const validations = {
  ifConditional: createValidationPair(
    {
      runtime: refineCondition(z.object({ ...conditionShape, actions: actionsArray }), 'secondOperand'),
      creation: refineCondition(z.object(conditionShape), 'secondOperand'),
    },
    {
      label: 'If ', icon: '🔀', category: 'flow', color: 'emerald', description: 'If conditional.',
      fieldConfig: conditionFields(''),
    }
  ),
  elseIfConditional: createValidationPair(
    {
      runtime: refineCondition(z.object({ ...conditionShape, actions: actionsArray }), 'secondOperand'),
      creation: refineCondition(z.object(conditionShape), 'secondOperand'),
    },
    {
      label: 'ElseIf', icon: '🔀', category: 'flow', color: 'emerald', description: 'Elseif conditional',
      fieldConfig: conditionFields(''),
    }
  ),
  elseConditional: createValidationPair(
    {
      runtime: z.object({
        actions: actionsArray,
      }),
      creation: z.object({}),
    },
    {
      label: 'Else', icon: '🔀', category: 'flow', color: 'emerald', description: 'Else conditional.',
      fieldConfig: {},
    }
  ),
  conditionalLoop: createValidationPair(
    {
      runtime: refineCondition(
        z.object({ ...conditionShape, indexVariable: z.string().optional(), actions: actionsArray }),
        'secondOperand'
      ),
      creation: refineCondition(
        z.object({ ...conditionShape, indexVariable: z.string().optional() }),
        'secondOperand'
      ),
    },
    {
      label: 'Conditional Loop',
      icon: '🔁',
      category: 'flow',
      color: 'amber',
      description: 'Loop while a condition remains true.',
      fieldConfig: {
        ...conditionFields(' on each iteration (the loop runs while the condition is true)'),
        indexVariable: {
          description: 'Optional existing number variable to hold the current iteration count (starting at 0).',
          component: 'variable-select',
          variableType: 'number',
          suggestedName: 'index',
        },
      },
    }
  ),

  switchConditional: createValidationPair(
    {
      runtime: z.object({
        expression: z.string(),
      }),
      creation: z.object({
        expression: z.string(),
      }),
    },
    {
      label: 'Switch',
      icon: '🎚️',
      category: 'flow',
      color: 'emerald',
      description: 'Declare the expression to match against cases.',
      fieldConfig: {
        expression: { description: 'The value or expression to match against case blocks.' },
      },
    }
  ),

  caseConditional: createValidationPair(
    {
      runtime: z.object({
        match: z.string(),
        actions: actionsArray,
      }),
      creation: z.object({
        match: z.string(),
      }),
    },
    {
      label: 'Case',
      icon: '🔘',
      category: 'flow',
      color: 'emerald',
      description: 'Run actions when the switch expression matches this value.',
      fieldConfig: {
        match: { description: 'The value this case matches against the switch expression.' },
      },
    }
  ),

  defaultConditional: createValidationPair(
    {
      runtime: z.object({
        actions: actionsArray,
      }),
      creation: z.object({}),
    },
    {
      label: 'Default',
      icon: '↩️',
      category: 'flow',
      color: 'emerald',
      description: 'Fallback branch when no case matched.',
      fieldConfig: {},
    }
  ),

  simpleLoop: createValidationPair(
    {
      runtime: z.object({
        indexValue: z.number(),
        indexEndValue: z.number(),
        incrementBy: z.number(),
        indexVariable: z.string().optional(),
        actions: actionsArray,
      }),
      creation: z.object({
        indexValue: z.number(),
        indexEndValue: z.number(),
        incrementBy: z.number(),
        indexVariable: z.string().optional(),
      }),
    },
    {
      label: 'Simple Loop',
      icon: '🔂',
      category: 'flow',
      color: 'amber',
      description: 'For-loop from start to end by increment.',
      fieldConfig: {
        indexValue: { description: 'Starting index value (inclusive).' },
        indexEndValue: { description: 'Ending index value (exclusive).' },
        incrementBy: { description: 'Amount to increment the index on each iteration.' },
        indexVariable: {
          description: 'Optional existing number variable to hold the current loop index on each iteration.',
          component: 'variable-select',
          variableType: 'number',
          suggestedName: 'index',
        },
      },
    }
  ),

  forEachLoop: createValidationPair(
    {
      runtime: z.object({
        iterable: z.union([z.string(), z.array(z.any())]),
        currentItem: z.string(),
        indexVariable: z.string().optional(),
        actions: actionsArray,
      }),
      creation: z.object({
        iterable: z.union([z.string(), z.array(z.any())]),
        currentItem: z.string(),
        indexVariable: z.string().optional(),
      }),
    },
    {
      label: 'For Each',
      icon: '📦',
      category: 'flow',
      color: 'amber',
      description: 'Iterate over items and run steps per item.',
      fieldConfig: {
        iterable: { description: 'The array or string variable to iterate over.' },
        currentItem: {
          description: 'Variable name to bind the current element on each iteration.',
          component: 'variable-select',
          suggestedName: 'item',
        },
        indexVariable: {
          description: 'Optional existing number variable to hold the current position (starting at 0) on each iteration.',
          component: 'variable-select',
          variableType: 'number',
          suggestedName: 'index',
        },
      },
    }
  ),

  wait: createValidationPair(
    {
      runtime: z.object({
        timeout: z.number().optional(),
      }),
      creation: z.object({
        timeout: orTemplateString(z.number()).optional(),
      }),
    },
    {
      label: 'Wait', icon: '⏳', category: 'flow', description: 'Pause execution for a duration.',
      fieldConfig: {
        timeout: { description: 'Duration to wait in milliseconds.' },
      },
    }
  ),
};

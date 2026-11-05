import {
  CASE_OPERATORS,
  COMPARE_AS,
  CONDITION_OPERATORS,
  isUnaryOperator,
  operatorAllowed,
} from '@tipeline/utils';
import { DependencyType, type Dependency, type EnumValues } from '@/components/ui/auto-form/interface';

// How the builder's form shows a condition: pick "Compare as" first, then only that
// type's operators are offered; the compare-with field hides for operators that
// don't use one, and "Ignore case" only shows where it applies.

/** Steps whose form has a condition, and the field holding what it's compared with. */
const CONDITION_STEPS: Record<string, Record<string, 'secondOperand' | 'value'>> = {
  flow: { ifConditional: 'secondOperand', elseIfConditional: 'secondOperand', conditionalLoop: 'secondOperand' },
  array: { find: 'value', filter: 'value', some: 'value', every: 'value', count: 'value' },
};

export function conditionCompareToField(group?: string, name?: string): 'secondOperand' | 'value' | undefined {
  return group && name ? CONDITION_STEPS[group]?.[name] : undefined;
}

// The compare-with field means something different per operator — name it.
const COMPARE_TO_LABELS: Record<string, string> = {
  contains: 'Value to find',
  notContains: 'Value to find',
  startsWith: 'Prefix',
  notStartsWith: 'Prefix',
  endsWith: 'Suffix',
  notEndsWith: 'Suffix',
  matchesRegex: 'Pattern (regex)',
  notMatchesRegex: 'Pattern (regex)',
  lengthEq: 'Length',
  lengthNeq: 'Length',
  lengthGt: 'Length',
  lengthGte: 'Length',
  lengthLt: 'Length',
  lengthLte: 'Length',
  hasKey: 'Key',
  notHasKey: 'Key',
  after: 'Date',
  afterOrEqual: 'Date',
  before: 'Date',
  beforeOrEqual: 'Date',
};

const CASE_TYPES = ['string', 'array'];

export function conditionDependencies(compareTo: 'secondOperand' | 'value'): Dependency<any>[] {
  return [
    // Nothing to choose until the type is picked.
    { sourceField: 'compareAs', targetField: 'operator', type: DependencyType.HIDES, when: (t) => !t },
    { sourceField: 'compareAs', targetField: compareTo, type: DependencyType.HIDES, when: (t) => !t },
    ...COMPARE_AS.map(
      (type): Dependency<any> => ({
        sourceField: 'compareAs',
        targetField: 'operator',
        type: DependencyType.SETS_OPTIONS,
        options: CONDITION_OPERATORS[type] as unknown as EnumValues,
        when: (t) => t === type,
      })
    ),
    {
      sourceField: 'operator',
      targetField: compareTo,
      type: DependencyType.HIDES,
      when: (op) => typeof op === 'string' && isUnaryOperator(op),
    },
    ...Object.entries(COMPARE_TO_LABELS).map(
      ([operator, label]): Dependency<any> => ({
        sourceField: 'operator',
        targetField: compareTo,
        type: DependencyType.SETS_LABEL,
        label,
        when: (op) => op === operator,
      })
    ),
    {
      sourceField: 'compareAs',
      targetField: 'ignoreCase',
      type: DependencyType.HIDES,
      when: (t) => !CASE_TYPES.includes(t),
    },
    {
      sourceField: 'operator',
      targetField: 'ignoreCase',
      type: DependencyType.HIDES,
      when: (op) => !(CASE_OPERATORS as readonly string[]).includes(op),
    },
  ];
}

/** The operator to keep after "Compare as" changes: the same one if the new type has it. */
export function operatorAfterTypeChange(compareAs: unknown, operator: unknown): string | undefined {
  if (typeof operator !== 'string' || !operator) return undefined;
  return typeof compareAs === 'string' && operatorAllowed(compareAs, operator) ? operator : undefined;
}

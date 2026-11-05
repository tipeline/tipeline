// One condition engine for every place that compares values: If / ElseIf /
// Conditional Loop, the array actions (filter, find, some, every, count) and app
// color rules. A condition says how to read its values (`compareAs`) and which
// comparison to make (`operator`); both sides are converted to that type first,
// so `{{ total }}` (always text) still compares as a number.

export const COMPARE_AS = ['string', 'number', 'date', 'boolean', 'array', 'object'] as const;
export type CompareAs = (typeof COMPARE_AS)[number];

/** Operators every type has. They look at the raw value and never convert it. */
const PRESENCE_OPERATORS = ['exists', 'notExists', 'empty', 'notEmpty', 'isValid'] as const;

const LENGTH_OPERATORS = ['lengthEq', 'lengthNeq', 'lengthGt', 'lengthGte', 'lengthLt', 'lengthLte'] as const;

/** The operators each `compareAs` type offers, in the order the builder lists them. */
export const CONDITION_OPERATORS = {
  string: [
    'eq',
    'neq',
    'contains',
    'notContains',
    'startsWith',
    'notStartsWith',
    'endsWith',
    'notEndsWith',
    'matchesRegex',
    'notMatchesRegex',
    ...LENGTH_OPERATORS,
    ...PRESENCE_OPERATORS,
  ],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', ...PRESENCE_OPERATORS],
  date: ['eq', 'neq', 'after', 'afterOrEqual', 'before', 'beforeOrEqual', ...PRESENCE_OPERATORS],
  boolean: ['isTrue', 'isFalse', 'eq', 'neq', ...PRESENCE_OPERATORS],
  array: ['contains', 'notContains', ...LENGTH_OPERATORS, ...PRESENCE_OPERATORS],
  object: ['hasKey', 'notHasKey', ...PRESENCE_OPERATORS],
} as const satisfies Record<CompareAs, readonly string[]>;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[CompareAs][number];

/** Every operator id across all types (the schema enum; `operatorAllowed` checks the pairing). */
export const ALL_CONDITION_OPERATORS = [
  ...new Set(Object.values(CONDITION_OPERATORS).flat()),
] as ConditionOperator[];

/** Operators that take no right-hand value. */
export const UNARY_CONDITION_OPERATORS: readonly ConditionOperator[] = [
  ...PRESENCE_OPERATORS,
  'isTrue',
  'isFalse',
];

/** Operators `ignoreCase` applies to. */
export const CASE_OPERATORS: readonly ConditionOperator[] = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith',
  'matchesRegex',
  'notMatchesRegex',
];

/** Friendly names for the builder's operator dropdown. */
export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'Equals',
  neq: 'Does not equal',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
  contains: 'Contains',
  notContains: 'Does not contain',
  startsWith: 'Starts with',
  notStartsWith: 'Does not start with',
  endsWith: 'Ends with',
  notEndsWith: 'Does not end with',
  matchesRegex: 'Matches regex',
  notMatchesRegex: 'Does not match regex',
  after: 'Is after',
  afterOrEqual: 'Is after or equal to',
  before: 'Is before',
  beforeOrEqual: 'Is before or equal to',
  isTrue: 'Is true',
  isFalse: 'Is false',
  hasKey: 'Has key',
  notHasKey: 'Does not have key',
  lengthEq: 'Length equals',
  lengthNeq: 'Length does not equal',
  lengthGt: 'Length greater than',
  lengthGte: 'Length greater than or equal to',
  lengthLt: 'Length less than',
  lengthLte: 'Length less than or equal to',
  exists: 'Exists',
  notExists: 'Does not exist',
  empty: 'Is empty',
  notEmpty: 'Is not empty',
  isValid: 'Is valid',
};

export const COMPARE_AS_LABELS: Record<CompareAs, string> = {
  string: 'Text',
  number: 'Number',
  date: 'Date & time',
  boolean: 'Boolean',
  array: 'Array',
  object: 'Object',
};

export function operatorAllowed(compareAs: string, operator: string): boolean {
  const list = CONDITION_OPERATORS[compareAs as CompareAs] as readonly string[] | undefined;
  return !!list && list.includes(operator);
}

export function isUnaryOperator(operator: string): boolean {
  return (UNARY_CONDITION_OPERATORS as readonly string[]).includes(operator);
}

export interface Condition {
  /** The value being checked (the If's firstOperand, an array item, a table cell). */
  value: unknown;
  compareAs: CompareAs;
  operator: ConditionOperator;
  /** What it's compared against (the If's secondOperand); unused by unary operators. */
  compareTo?: unknown;
  /** Text comparisons ignore upper/lower case. */
  ignoreCase?: boolean;
}

/**
 * A value that couldn't be read as the condition's type. `side` says which one, so a
 * caller can treat a bad data value differently from a bad setting (the array
 * actions skip a row whose value doesn't convert, but stop on a bad compareTo).
 */
export class ConditionError extends Error {
  constructor(
    message: string,
    readonly side: 'value' | 'compareTo'
  ) {
    super(message);
    this.name = 'ConditionError';
  }
}

const describe = (v: unknown): string => {
  if (v === undefined) return 'nothing (undefined)';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  if (v instanceof Date) return 'a date';
  if (typeof v === 'object') return 'an object';
  const text = JSON.stringify(v);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

/** Hint for the most common mistake: `{{ list }}` renders a list as text. */
const LIST_HINT = ' Use {= name =} instead of {{ name }} to pass the value itself, not its text.';

type Converted<T> = { ok: true; value: T } | { ok: false; reason: string; hint?: string };

function toStringValue(v: unknown): Converted<string> {
  if (typeof v === 'string') return { ok: true, value: v };
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
    return { ok: true, value: String(v) };
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { ok: true, value: v.toISOString() };
  return { ok: false, reason: `is ${describe(v)}, not text` };
}

function toNumberValue(v: unknown): Converted<number> {
  if (typeof v === 'number' && !Number.isNaN(v)) return { ok: true, value: v };
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    if (!Number.isNaN(n)) return { ok: true, value: n };
  }
  return { ok: false, reason: `is ${describe(v)}, not a number` };
}

// A date-only string ("2026-10-01") is midnight local time, like a typed date —
// `new Date()` would read it as UTC midnight and compare it hours off.
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDateValue(v: unknown): Converted<number> {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { ok: true, value: v.getTime() };
  if (typeof v === 'number' && Number.isFinite(v)) return { ok: true, value: v };
  if (typeof v === 'string' && v.trim() !== '') {
    const text = v.trim();
    const dateOnly = DATE_ONLY.exec(text);
    const time = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime()
      : new Date(text).getTime();
    if (!Number.isNaN(time)) return { ok: true, value: time };
  }
  return { ok: false, reason: `is ${describe(v)}, not a date` };
}

const TRUE_WORDS = ['true', 'yes', '1', 'on'];
const FALSE_WORDS = ['false', 'no', '0', 'off'];

function toBooleanValue(v: unknown): Converted<boolean> {
  if (typeof v === 'boolean') return { ok: true, value: v };
  if (v === 1 || v === 0) return { ok: true, value: v === 1 };
  if (typeof v === 'string') {
    const word = v.trim().toLowerCase();
    if (TRUE_WORDS.includes(word)) return { ok: true, value: true };
    if (FALSE_WORDS.includes(word)) return { ok: true, value: false };
  }
  return { ok: false, reason: `is ${describe(v)}, not true or false` };
}

function toArrayValue(v: unknown): Converted<unknown[]> {
  if (Array.isArray(v)) return { ok: true, value: v };
  return { ok: false, reason: `is ${describe(v)}, not an array`, hint: typeof v === 'string' ? LIST_HINT : undefined };
}

function toObjectValue(v: unknown): Converted<Record<string, unknown>> {
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date))
    return { ok: true, value: v as Record<string, unknown> };
  return { ok: false, reason: `is ${describe(v)}, not an object`, hint: typeof v === 'string' ? LIST_HINT : undefined };
}

const CONVERTERS: Record<CompareAs, (v: unknown) => Converted<unknown>> = {
  string: toStringValue,
  number: toNumberValue,
  date: toDateValue,
  boolean: toBooleanValue,
  array: toArrayValue,
  object: toObjectValue,
};

function convert<T>(v: unknown, as: (v: unknown) => Converted<T>, side: 'value' | 'compareTo', label: string): T {
  const result = as(v);
  if (!result.ok) {
    const name = side === 'value' ? 'The value' : 'The value to compare with';
    throw new ConditionError(`${name} ${result.reason} (compared as ${label}).${result.hint ?? ''}`, side);
  }
  return result.value;
}

/** null, undefined, '', [] and {} are empty; numbers, booleans and dates never are. */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' || Array.isArray(v)) return v.length === 0;
  if (v instanceof Date) return false;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

/**
 * Whether an array item matches what's being looked for: equal objects match by
 * content, and a number item matches its text (`[1, 2]` contains "2", as typed in
 * the builder).
 */
function itemMatches(item: unknown, wanted: unknown, ignoreCase: boolean): boolean {
  if (deepEqual(item, wanted)) return true;
  const primitive = (v: unknown) => ['string', 'number', 'boolean'].includes(typeof v);
  if (!primitive(item) || !primitive(wanted)) return false;
  const a = String(item);
  const b = String(wanted);
  return ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function buildRegex(pattern: string, ignoreCase: boolean): RegExp {
  try {
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch (error: any) {
    throw new ConditionError(`"${pattern}" is not a valid regular expression: ${error?.message ?? error}`, 'compareTo');
  }
}

function lengthOf(compareAs: CompareAs, value: unknown): number {
  if (compareAs === 'array') return convert(value, toArrayValue, 'value', 'array').length;
  return convert(value, toStringValue, 'value', 'text').length;
}

function compareLength(operator: string, length: number, compareTo: unknown): boolean {
  const n = convert(compareTo, toNumberValue, 'compareTo', 'number');
  switch (operator) {
    case 'lengthEq':
      return length === n;
    case 'lengthNeq':
      return length !== n;
    case 'lengthGt':
      return length > n;
    case 'lengthGte':
      return length >= n;
    case 'lengthLt':
      return length < n;
    default:
      return length <= n;
  }
}

/**
 * Evaluates one condition. Throws a ConditionError when a value can't be read as the
 * condition's type, rather than quietly answering false.
 */
export function evaluateCondition(condition: Condition): boolean {
  const { value, compareAs, operator, compareTo } = condition;
  const ignoreCase = !!condition.ignoreCase;

  if (!(compareAs in CONVERTERS)) {
    throw new ConditionError(`Unknown compareAs "${compareAs}".`, 'compareTo');
  }
  if (!operatorAllowed(compareAs, operator)) {
    throw new ConditionError(
      `"${operator}" can't be used to compare ${COMPARE_AS_LABELS[compareAs].toLowerCase()} values.`,
      'compareTo'
    );
  }

  switch (operator) {
    case 'exists':
      return value !== undefined && value !== null;
    case 'notExists':
      return value === undefined || value === null;
    case 'empty':
      return isEmptyValue(value);
    case 'notEmpty':
      return !isEmptyValue(value);
    case 'isValid':
      return value !== undefined && value !== null && CONVERTERS[compareAs](value).ok;
  }

  if (operator.startsWith('length')) {
    return compareLength(operator, lengthOf(compareAs, value), compareTo);
  }

  const label = COMPARE_AS_LABELS[compareAs].toLowerCase();

  switch (compareAs) {
    case 'string': {
      let a = convert(value, toStringValue, 'value', label);
      let b = convert(compareTo ?? '', toStringValue, 'compareTo', label);
      if (operator === 'matchesRegex' || operator === 'notMatchesRegex') {
        const matched = buildRegex(b, ignoreCase).test(a);
        return operator === 'matchesRegex' ? matched : !matched;
      }
      if (ignoreCase) {
        a = a.toLowerCase();
        b = b.toLowerCase();
      }
      switch (operator) {
        case 'eq':
          return a === b;
        case 'neq':
          return a !== b;
        case 'contains':
          return a.includes(b);
        case 'notContains':
          return !a.includes(b);
        case 'startsWith':
          return a.startsWith(b);
        case 'notStartsWith':
          return !a.startsWith(b);
        case 'endsWith':
          return a.endsWith(b);
        case 'notEndsWith':
          return !a.endsWith(b);
      }
      break;
    }

    case 'number':
    case 'date': {
      const as = compareAs === 'number' ? toNumberValue : toDateValue;
      const a = convert(value, as, 'value', label);
      const b = convert(compareTo, as, 'compareTo', label);
      switch (operator) {
        case 'eq':
          return a === b;
        case 'neq':
          return a !== b;
        case 'gt':
        case 'after':
          return a > b;
        case 'gte':
        case 'afterOrEqual':
          return a >= b;
        case 'lt':
        case 'before':
          return a < b;
        case 'lte':
        case 'beforeOrEqual':
          return a <= b;
      }
      break;
    }

    case 'boolean': {
      const a = convert(value, toBooleanValue, 'value', label);
      switch (operator) {
        case 'isTrue':
          return a;
        case 'isFalse':
          return !a;
      }
      const b = convert(compareTo, toBooleanValue, 'compareTo', label);
      return operator === 'eq' ? a === b : a !== b;
    }

    case 'array': {
      const list = convert(value, toArrayValue, 'value', label);
      const found = list.some((item) => itemMatches(item, compareTo, ignoreCase));
      return operator === 'contains' ? found : !found;
    }

    case 'object': {
      const obj = convert(value, toObjectValue, 'value', label);
      const key = convert(compareTo, toStringValue, 'compareTo', 'text');
      const has = Object.prototype.hasOwnProperty.call(obj, key);
      return operator === 'hasKey' ? has : !has;
    }
  }

  throw new ConditionError(`Unknown operator "${operator}".`, 'compareTo');
}

/** Like evaluateCondition, but a value that can't be converted simply doesn't match. */
export function matchesCondition(condition: Condition): boolean {
  try {
    return evaluateCondition(condition);
  } catch (error) {
    if (error instanceof ConditionError) return false;
    throw error;
  }
}

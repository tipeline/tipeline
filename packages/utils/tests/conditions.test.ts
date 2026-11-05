import { describe, it, expect } from 'vitest';
import {
  ALL_CONDITION_OPERATORS,
  COMPARE_AS,
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_LABELS,
  ConditionError,
  evaluateCondition,
  isUnaryOperator,
  matchesCondition,
  operatorAllowed,
  type Condition,
} from '../src/conditions';

const check = (value: unknown, compareAs: Condition['compareAs'], operator: string, compareTo?: unknown, ignoreCase?: boolean) =>
  evaluateCondition({ value, compareAs, operator: operator as any, compareTo, ignoreCase });

describe('operator lists', () => {
  it('labels every operator', () => {
    for (const op of ALL_CONDITION_OPERATORS) expect(CONDITION_OPERATOR_LABELS[op]).toBeTruthy();
  });

  it('gives every type the presence checks', () => {
    for (const type of COMPARE_AS) {
      for (const op of ['exists', 'notExists', 'empty', 'notEmpty', 'isValid']) {
        expect(operatorAllowed(type, op)).toBe(true);
      }
    }
  });

  it('only allows an operator with the types that have it', () => {
    expect(operatorAllowed('string', 'startsWith')).toBe(true);
    expect(operatorAllowed('number', 'startsWith')).toBe(false);
    expect(operatorAllowed('date', 'gt')).toBe(false);
    expect(operatorAllowed('nope', 'eq')).toBe(false);
  });

  it('rejects a pairing the type does not have', () => {
    expect(() => check('a', 'string', 'after', 'b')).toThrow(ConditionError);
  });

  it('knows which operators take no compareTo', () => {
    expect(isUnaryOperator('isTrue')).toBe(true);
    expect(isUnaryOperator('empty')).toBe(true);
    expect(isUnaryOperator('eq')).toBe(false);
  });
});

describe('presence operators (every type, no conversion)', () => {
  it.each(COMPARE_AS)('%s: exists / notExists', (type) => {
    expect(check('x', type, 'exists')).toBe(true);
    expect(check(0, type, 'exists')).toBe(true);
    expect(check(undefined, type, 'exists')).toBe(false);
    expect(check(null, type, 'notExists')).toBe(true);
  });

  it.each(COMPARE_AS)('%s: empty / notEmpty', (type) => {
    for (const v of [undefined, null, '', [], {}]) expect(check(v, type, 'empty')).toBe(true);
    for (const v of ['a', 0, false, [1], { a: 1 }, new Date()]) expect(check(v, type, 'notEmpty')).toBe(true);
  });

  it('isValid says whether the value can be read as the type', () => {
    expect(check('42', 'number', 'isValid')).toBe(true);
    expect(check('abc', 'number', 'isValid')).toBe(false);
    expect(check('2026-10-01', 'date', 'isValid')).toBe(true);
    expect(check('not a date', 'date', 'isValid')).toBe(false);
    expect(check('yes', 'boolean', 'isValid')).toBe(true);
    expect(check('maybe', 'boolean', 'isValid')).toBe(false);
    expect(check([1], 'array', 'isValid')).toBe(true);
    expect(check('1,2', 'array', 'isValid')).toBe(false);
    expect(check({}, 'object', 'isValid')).toBe(true);
    expect(check([], 'object', 'isValid')).toBe(false);
    expect(check('text', 'string', 'isValid')).toBe(true);
    expect(check({}, 'string', 'isValid')).toBe(false);
    expect(check(undefined, 'string', 'isValid')).toBe(false);
  });
});

describe('string', () => {
  it('compares text', () => {
    expect(check('inactive', 'string', 'eq', 'inactive')).toBe(true);
    expect(check('inactive', 'string', 'neq', 'active')).toBe(true);
    expect(check('banana', 'string', 'contains', 'nan')).toBe(true);
    expect(check('banana', 'string', 'notContains', 'xyz')).toBe(true);
    expect(check('banana', 'string', 'startsWith', 'ban')).toBe(true);
    expect(check('banana', 'string', 'notStartsWith', 'ana')).toBe(true);
    expect(check('banana', 'string', 'endsWith', 'ana')).toBe(true);
    expect(check('banana', 'string', 'notEndsWith', 'ban')).toBe(true);
    expect(check('active', 'string', 'matchesRegex', '^act.*$')).toBe(true);
    expect(check('active', 'string', 'notMatchesRegex', '^in')).toBe(true);
  });

  it('is case-sensitive unless ignoreCase', () => {
    expect(check('Inactive', 'string', 'eq', 'inactive')).toBe(false);
    expect(check('Inactive', 'string', 'eq', 'inactive', true)).toBe(true);
    expect(check('BANANA', 'string', 'contains', 'nan', true)).toBe(true);
    expect(check('ACTIVE', 'string', 'matchesRegex', '^act', true)).toBe(true);
  });

  it('reads numbers and booleans as their text', () => {
    expect(check(42, 'string', 'eq', '42')).toBe(true);
    expect(check(true, 'string', 'eq', 'true')).toBe(true);
  });

  it('compares length', () => {
    expect(check('123456', 'string', 'lengthEq', 6)).toBe(true);
    expect(check('123456', 'string', 'lengthEq', '6')).toBe(true);
    expect(check('abc', 'string', 'lengthLt', 4)).toBe(true);
    expect(check('abc', 'string', 'lengthGte', 4)).toBe(false);
  });

  it('fails loudly on a value that is not text', () => {
    expect(() => check({ a: 1 }, 'string', 'eq', 'x')).toThrow(/not text/);
    expect(() => check(undefined, 'string', 'eq', 'x')).toThrow(ConditionError);
  });

  it('reports a bad regex as an error, not a crash', () => {
    const error = (() => {
      try {
        check('a', 'string', 'matchesRegex', '(');
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(ConditionError);
    expect((error as ConditionError).side).toBe('compareTo');
  });
});

describe('number', () => {
  it('converts text from {{ }} templates before comparing', () => {
    // The old behavior compared "10" > "9" as text and answered false.
    expect(check('10', 'number', 'gt', '9')).toBe(true);
    expect(check('10', 'number', 'gt', 9)).toBe(true);
    expect(check(' 1250 ', 'number', 'gte', 1000)).toBe(true);
    expect(check('10', 'number', 'eq', '10.0')).toBe(true);
    expect(check(3, 'number', 'lt', 3)).toBe(false);
    expect(check(3, 'number', 'lte', 3)).toBe(true);
    expect(check(3, 'number', 'neq', 4)).toBe(true);
  });

  it('names the bad side in the error', () => {
    try {
      check('abc', 'number', 'gt', 1);
      expect.unreachable();
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConditionError);
      expect(e.side).toBe('value');
      expect(e.message).toContain('"abc"');
      expect(e.message).toContain('not a number');
    }
    try {
      check(1, 'number', 'gt', 'x');
      expect.unreachable();
    } catch (e: any) {
      expect(e.side).toBe('compareTo');
    }
  });

  it('does not treat empty text as zero', () => {
    expect(() => check('', 'number', 'eq', 0)).toThrow(ConditionError);
  });
});

describe('date', () => {
  it('reads ISO strings, Date objects and timestamps', () => {
    expect(check('2026-01-01', 'date', 'before', '2026-10-01')).toBe(true);
    expect(check(new Date(2026, 9, 1), 'date', 'eq', '2026-10-01')).toBe(true);
    expect(check('2026-10-01T12:00:00Z', 'date', 'after', '2026-10-01T11:00:00Z')).toBe(true);
    expect(check(Date.UTC(2026, 0, 1), 'date', 'eq', '2026-01-01T00:00:00Z')).toBe(true);
  });

  it('reads a date-only string as local midnight', () => {
    expect(check('2026-10-01', 'date', 'eq', new Date(2026, 9, 1, 0, 0, 0))).toBe(true);
    expect(check('2026-10-01', 'date', 'before', new Date(2026, 9, 1, 0, 0, 1))).toBe(true);
  });

  it('handles the or-equal operators', () => {
    expect(check('2026-10-01', 'date', 'afterOrEqual', '2026-10-01')).toBe(true);
    expect(check('2026-10-01', 'date', 'beforeOrEqual', '2026-10-01')).toBe(true);
    expect(check('2026-10-02', 'date', 'neq', '2026-10-01')).toBe(true);
  });

  it('fails on text that is not a date', () => {
    expect(() => check('soon', 'date', 'after', '2026-01-01')).toThrow(/not a date/);
  });
});

describe('boolean', () => {
  it('reads true/false words from templates', () => {
    expect(check(true, 'boolean', 'isTrue')).toBe(true);
    expect(check('true', 'boolean', 'isTrue')).toBe(true);
    expect(check('Yes', 'boolean', 'isTrue')).toBe(true);
    expect(check('0', 'boolean', 'isFalse')).toBe(true);
    expect(check(1, 'boolean', 'isTrue')).toBe(true);
    expect(check('no', 'boolean', 'eq', false)).toBe(true);
    expect(check('no', 'boolean', 'neq', 'true')).toBe(true);
  });

  it('fails on anything else', () => {
    expect(() => check('maybe', 'boolean', 'isTrue')).toThrow(/not true or false/);
  });
});

describe('array', () => {
  it('contains an item', () => {
    expect(check(['editor', 'admin'], 'array', 'contains', 'admin')).toBe(true);
    expect(check(['editor'], 'array', 'notContains', 'admin')).toBe(true);
  });

  it('matches objects by content (the old === never did)', () => {
    expect(check([{ id: 3 }, { id: 4 }], 'array', 'contains', { id: 3 })).toBe(true);
    expect(check([{ id: 3, tags: ['a'] }], 'array', 'contains', { id: 3, tags: ['a'] })).toBe(true);
    expect(check([{ id: 3 }], 'array', 'contains', { id: 5 })).toBe(false);
  });

  it('matches a number item against its typed text', () => {
    expect(check([1, 2], 'array', 'contains', '2')).toBe(true);
  });

  it('can ignore case', () => {
    expect(check(['Admin'], 'array', 'contains', 'admin')).toBe(false);
    expect(check(['Admin'], 'array', 'contains', 'admin', true)).toBe(true);
  });

  it('compares length', () => {
    const items = [1, 2, 3];
    expect(check(items, 'array', 'lengthEq', 3)).toBe(true);
    expect(check(items, 'array', 'lengthNeq', 3)).toBe(false);
    expect(check(items, 'array', 'lengthGt', 2)).toBe(true);
    expect(check(items, 'array', 'lengthGte', 4)).toBe(false);
    expect(check(items, 'array', 'lengthLt', 4)).toBe(true);
    expect(check(items, 'array', 'lengthLte', 3)).toBe(true);
  });

  it('hints at {= =} when it receives text', () => {
    expect(() => check('a,b', 'array', 'contains', 'a')).toThrow(/\{= name =\}/);
  });
});

describe('object', () => {
  it('checks keys', () => {
    expect(check({ id: 1 }, 'object', 'hasKey', 'id')).toBe(true);
    expect(check({ id: 1 }, 'object', 'notHasKey', 'name')).toBe(true);
  });

  it('fails on arrays', () => {
    expect(() => check([], 'object', 'hasKey', 'id')).toThrow(/not an object/);
  });
});

describe('every type × operator pairing runs', () => {
  const samples: Record<string, [unknown, unknown]> = {
    string: ['abc', 'a'],
    number: [5, 3],
    date: ['2026-10-01', '2026-01-01'],
    boolean: [true, true],
    array: [[1, 2], 1],
    object: [{ a: 1 }, 'a'],
  };
  for (const type of COMPARE_AS) {
    for (const op of CONDITION_OPERATORS[type]) {
      it(`${type} ${op}`, () => {
        const [value, compareTo] = samples[type];
        const compareToFor = op.startsWith('length') ? 1 : compareTo;
        expect(typeof check(value, type, op, compareToFor)).toBe('boolean');
      });
    }
  }
});

describe('matchesCondition', () => {
  it('answers false instead of throwing on a value that does not convert', () => {
    expect(matchesCondition({ value: 'overdue', compareAs: 'number', operator: 'gt', compareTo: 10 })).toBe(false);
    expect(matchesCondition({ value: '20', compareAs: 'number', operator: 'gt', compareTo: 10 })).toBe(true);
  });
});

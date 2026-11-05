import { describe, expect, it } from 'vitest';
import { GroupMath } from '@/action/actions/math/actions';

describe('GroupMath', () => {
  describe('abs', () => {
    it('returns the absolute value of a negative number', () => {
      expect(GroupMath.abs({ number: -5 })).toBe(5);
    });

    it('returns the absolute value of a positive number', () => {
      expect(GroupMath.abs({ number: 5 })).toBe(5);
    });

    it('throws when number is missing', () => {
      expect(() => GroupMath.abs({} as any)).toThrow();
    });
  });

  describe('add', () => {
    it('adds two positive numbers', () => {
      expect(GroupMath.add({ augend: 2, addend: 3 })).toBe(5);
    });

    it('adds negative numbers', () => {
      expect(GroupMath.add({ augend: -2, addend: -3 })).toBe(-5);
    });

    it('coerces numeric strings', () => {
      expect(GroupMath.add({ augend: '2' as any, addend: '3' as any })).toBe(5);
    });
  });

  describe('subtract', () => {
    it('subtracts two numbers', () => {
      expect(GroupMath.subtract({ minuend: 10, subtrahend: 4 })).toBe(6);
    });

    it('produces a negative result when subtrahend is larger', () => {
      expect(GroupMath.subtract({ minuend: 4, subtrahend: 10 })).toBe(-6);
    });
  });

  describe('multiply', () => {
    it('multiplies two numbers', () => {
      expect(GroupMath.multiply({ multiplier: 4, multiplicand: 5 })).toBe(20);
    });

    it('returns 0 when multiplying by 0', () => {
      expect(GroupMath.multiply({ multiplier: 4, multiplicand: 0 })).toBe(0);
    });
  });

  describe('divide', () => {
    it('divides two numbers', () => {
      expect(GroupMath.divide({ dividend: 10, divisor: 2 })).toBe(5);
    });

    it('throws when dividing by 0', () => {
      expect(() => GroupMath.divide({ dividend: 10, divisor: 0 })).toThrow();
    });
  });

  describe('mod', () => {
    it('returns the remainder of a division', () => {
      expect(GroupMath.mod({ dividend: 10, divisor: 3 })).toBe(1);
    });

    it('returns 0 for an even division', () => {
      expect(GroupMath.mod({ dividend: 10, divisor: 2 })).toBe(0);
    });
  });

  describe('pow', () => {
    it('raises a base to an exponent', () => {
      expect(GroupMath.pow({ base: 2, exponent: 10 })).toBe(1024);
    });

    it('returns 1 when exponent is 0', () => {
      expect(GroupMath.pow({ base: 5, exponent: 0 })).toBe(1);
    });
  });

  describe('ceil', () => {
    it('rounds up to the nearest integer', () => {
      expect(GroupMath.ceil({ number: 7.1 })).toBe(8);
    });
  });

  describe('floor', () => {
    it('rounds down to the nearest integer', () => {
      expect(GroupMath.floor({ number: 7.9 })).toBe(7);
    });
  });

  describe('round', () => {
    it('rounds to the nearest integer', () => {
      expect(GroupMath.round({ number: 7.5 })).toBe(8);
    });

    it('rounds down when below the midpoint', () => {
      expect(GroupMath.round({ number: 7.4 })).toBe(7);
    });
  });

  describe('trunc', () => {
    it('truncates a positive float toward zero', () => {
      expect(GroupMath.trunc({ number: 7.9 })).toBe(7);
    });

    it('truncates a negative float toward zero', () => {
      expect(GroupMath.trunc({ number: -7.9 })).toBe(-7);
    });
  });

  describe('toFixed', () => {
    it('formats a number to the given decimal places', () => {
      expect(GroupMath.toFixed({ number: 3.14159, digits: 2 })).toBe('3.14');
    });

    it('pads with zeros when the number has fewer decimals', () => {
      expect(GroupMath.toFixed({ number: 3, digits: 2 })).toBe('3.00');
    });
  });

  describe('formatNumber', () => {
    it('formats a number with locale grouping', () => {
      expect(
        GroupMath.formatNumber({
          number: 15000,
          locale: 'en-US',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      ).toBe('15,000.00');
    });

    it('defaults to en-US when locale is not provided', () => {
      expect(
        GroupMath.formatNumber({
          number: 1000,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        } as any)
      ).toBe('1,000');
    });
  });

  describe('max', () => {
    it('returns the largest number in the array', () => {
      expect(GroupMath.max({ array: [3, 1, 4, 1, 5, 9, 2, 6] })).toBe(9);
    });

    it('returns the only value for a single-element array', () => {
      expect(GroupMath.max({ array: [7] })).toBe(7);
    });
  });

  describe('mean', () => {
    it('returns the arithmetic mean', () => {
      expect(GroupMath.mean({ array: [1, 2, 3, 4] })).toBe(2.5);
    });
  });

  describe('min', () => {
    it('returns the smallest number in the array', () => {
      expect(GroupMath.min({ array: [3, 1, 4, 1, 5, 9, 2, 6] })).toBe(1);
    });
  });

  describe('sum', () => {
    it('sums all numbers in the array', () => {
      expect(GroupMath.sum({ array: [1, 2, 3, 4, 5] })).toBe(15);
    });

    it('returns 0 for an all-zero array', () => {
      expect(GroupMath.sum({ array: [0, 0, 0] })).toBe(0);
    });
  });

  describe('median', () => {
    it('returns the middle value for an odd-length array', () => {
      expect(GroupMath.median({ array: [5, 1, 3] })).toBe(3);
    });

    it('returns the mean of the two middle values for an even-length array', () => {
      expect(GroupMath.median({ array: [1, 2, 3, 4] })).toBe(2.5);
    });

    it('does not mutate the input array', () => {
      const array = [5, 1, 3];
      GroupMath.median({ array });
      expect(array).toEqual([5, 1, 3]);
    });
  });

  describe('clamp', () => {
    it('returns the value unchanged when within range', () => {
      expect(GroupMath.clamp({ value: 5, min: 1, max: 10 })).toBe(5);
    });

    it('clamps to the minimum', () => {
      expect(GroupMath.clamp({ value: -5, min: 1, max: 10 })).toBe(1);
    });

    it('clamps to the maximum', () => {
      expect(GroupMath.clamp({ value: 50, min: 1, max: 10 })).toBe(10);
    });
  });

  describe('percentage', () => {
    it('calculates the percentage of a value relative to a total', () => {
      expect(GroupMath.percentage({ value: 25, total: 200 })).toBe(12.5);
    });
  });

  describe('sign', () => {
    it('returns -1 for a negative number', () => {
      expect(GroupMath.sign({ number: -42 })).toBe(-1);
    });

    it('returns 0 for zero', () => {
      expect(GroupMath.sign({ number: 0 })).toBe(0);
    });

    it('returns 1 for a positive number', () => {
      expect(GroupMath.sign({ number: 42 })).toBe(1);
    });
  });

  describe('increment', () => {
    it('increments by the default step of 1', () => {
      expect(GroupMath.increment({ number: 5 } as any)).toBe(6);
    });

    it('increments by a custom step', () => {
      expect(GroupMath.increment({ number: 5, step: 3 })).toBe(8);
    });
  });

  describe('decrement', () => {
    it('decrements by the default step of 1', () => {
      expect(GroupMath.decrement({ number: 5 } as any)).toBe(4);
    });

    it('decrements by a custom step', () => {
      expect(GroupMath.decrement({ number: 5, step: 3 })).toBe(2);
    });
  });

  describe('inRange', () => {
    it('returns true when value is within the inclusive range', () => {
      expect(GroupMath.inRange({ value: 250, min: 200, max: 299 })).toBe(true);
    });

    it('returns true at the range boundaries', () => {
      expect(GroupMath.inRange({ value: 200, min: 200, max: 299 })).toBe(true);
      expect(GroupMath.inRange({ value: 299, min: 200, max: 299 })).toBe(true);
    });

    it('returns false when value is outside the range', () => {
      expect(GroupMath.inRange({ value: 400, min: 200, max: 299 })).toBe(false);
    });
  });

  describe('random', () => {
    it('returns a value within the default [0, 1) range', () => {
      const result = GroupMath.random({} as any);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(1);
    });

    it('returns a value within a custom [min, max) range', () => {
      const result = GroupMath.random({ min: 500, max: 1500 });
      expect(result).toBeGreaterThanOrEqual(500);
      expect(result).toBeLessThan(1500);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { safeClone } from '@utils/safeClone';

describe('safeClone', () => {
  it('returns primitives unchanged', () => {
    expect(safeClone(42)).toBe(42);
    expect(safeClone('hello')).toBe('hello');
    expect(safeClone(true)).toBe(true);
    expect(safeClone(undefined)).toBeUndefined();
  });

  it('passes through null', () => {
    expect(safeClone(null)).toBeNull();
  });

  it('deep clones a plain object', () => {
    const original = { a: 1, b: { c: 2 } };
    const clone = safeClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.b).not.toBe(original.b);
  });

  it('deep clones an array, including nested arrays/objects', () => {
    const original = [1, { a: 2 }, [3, 4]];
    const clone = safeClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone[1]).not.toBe(original[1]);
    expect(clone[2]).not.toBe(original[2]);
  });

  it('does not mutate the original when the clone is mutated', () => {
    const original = { a: 1, nested: { b: 2 } };
    const clone = safeClone(original);

    (clone as any).nested.b = 999;
    (clone as any).c = 'new';

    expect(original.nested.b).toBe(2);
    expect((original as any).c).toBeUndefined();
  });

  it('preserves function values by reference (unlike JSON clone)', () => {
    const fn = () => 'result';
    const original = { callback: fn };
    const clone = safeClone(original);

    expect(clone.callback).toBe(fn);
    expect(typeof clone.callback).toBe('function');
  });

  it('preserves a class instance by reference, including its prototype/methods', () => {
    class Connection {
      host = 'localhost';
      connect() {
        return 'connected';
      }
    }
    const instance = new Connection();
    const original = { connection: instance };
    const clone = safeClone(original);

    expect(clone.connection).toBe(instance);
    expect(clone.connection).toBeInstanceOf(Connection);
    expect((clone.connection as any).connect()).toBe('connected');
  });

  it('still deep clones a plain object nested alongside a preserved class instance', () => {
    class Connection {
      host = 'localhost';
    }
    const instance = new Connection();
    const original = { connection: instance, config: { retries: 3 } };
    const clone = safeClone(original);

    expect(clone.connection).toBe(instance);
    expect(clone.config).toEqual({ retries: 3 });
    expect(clone.config).not.toBe(original.config);
  });

  it('handles a mix of primitives, arrays, objects, and functions nested together', () => {
    const fn = () => {};
    const original = {
      name: 'task',
      count: 3,
      active: true,
      tags: ['a', 'b'],
      meta: { nested: { deep: [1, 2, { x: fn }] } },
    };

    const clone = safeClone(original);

    expect(clone).toEqual(original);
    expect(clone.meta).not.toBe(original.meta);
    expect(clone.meta.nested.deep).not.toBe(original.meta.nested.deep);
    expect((clone.meta.nested.deep[2] as any).x).toBe(fn);
  });
});

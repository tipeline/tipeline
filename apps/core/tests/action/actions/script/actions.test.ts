import { describe, expect, it } from 'vitest';
import { GroupScript } from '@/action/actions/script/actions';

describe('GroupScript', () => {
  describe('runScript', () => {
    it('returns the value returned by the script', async () => {
      const result = await GroupScript.runScript({ code: 'return 1 + 1;' });
      expect(result).toBe(2);
    });

    it('returns undefined when the script does not return anything', async () => {
      const result = await GroupScript.runScript({ code: 'const x = 1;' });
      expect(result).toBeUndefined();
    });

    it('exposes context values inside the sandbox', async () => {
      const result = await GroupScript.runScript({
        code: 'return firstName + " " + lastName;',
        context: { firstName: 'Ada', lastName: 'Lovelace' },
      });
      expect(result).toBe('Ada Lovelace');
    });

    it('supports async scripts via allowAsync', async () => {
      const result = await GroupScript.runScript({
        code: 'const value = await Promise.resolve(21); return value * 2;',
      });
      expect(result).toBe(42);
    });

    it('strips the vm2 object wrapper via JSON round-trip for object results', async () => {
      const result = await GroupScript.runScript({
        code: 'return { a: 1, b: [1, 2, 3] };',
      });
      expect(result).toEqual({ a: 1, b: [1, 2, 3] });
    });

    it('provides a log helper that does not throw', async () => {
      const result = await GroupScript.runScript({
        code: 'log("debug message"); return "done";',
      });
      expect(result).toBe('done');
    });

    it('does not expose Node internals like require or process', async () => {
      const result = await GroupScript.runScript({
        code: 'return typeof require + "," + typeof process;',
      });
      expect(result).toBe('undefined,undefined');
    });

    it('wraps a thrown error with the action prefix', async () => {
      await expect(
        GroupScript.runScript({ code: 'throw new Error("boom");' })
      ).rejects.toThrow('[script.runScript] boom');
    });

    it('rejects when the script has a syntax error', async () => {
      await expect(GroupScript.runScript({ code: 'return (' })).rejects.toThrow(
        '[script.runScript]'
      );
    });

    it('strips functions out of the context before exposing it to the sandbox', async () => {
      const result = await GroupScript.runScript({
        code: 'return typeof notAFunction;',
        context: { notAFunction: (() => 'nope') as any },
      });
      expect(result).toBe('undefined');
    });

    it('throws a validation error when code is missing', async () => {
      await expect(GroupScript.runScript({} as any)).rejects.toThrow();
    });

    it('throws a validation error when code is an empty string', async () => {
      await expect(GroupScript.runScript({ code: '' })).rejects.toThrow();
    });
  });
});

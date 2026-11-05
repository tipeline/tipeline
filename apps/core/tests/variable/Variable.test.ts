import { describe, expect, it } from 'vitest';
import { Variable } from '@variable/Variable';

// Minimal duck-typed fixtures matching the Zod `z.custom` guards in
// @tipeline/types (isVideoInstance / isAudioInstance / isBrowserInstance),
// so real schema validation (not mocked) passes for complex variable types.
function makeFakeVideo(overrides: Partial<Record<string, any>> = {}) {
  return {
    input: 'input.mp4',
    prefixOptions: [],
    suffixOptions: [],
    videoFilters: [],
    audioFilters: [],
    tempFiles: [],
    reset: () => {},
    createTempFile: () => 'tmp',
    cleanup: () => {},
    ...overrides,
  };
}

function makeFakeAudio(overrides: Partial<Record<string, any>> = {}) {
  return {
    input: 'input.mp3',
    prefixOptions: [],
    suffixOptions: [],
    audioFilters: [],
    tempFiles: [],
    format: null,
    reset: () => {},
    createTempFile: () => 'tmp',
    cleanup: () => {},
    ...overrides,
  };
}

function makeFakeBrowser(overrides: Partial<Record<string, any>> = {}) {
  return {
    close: () => {},
    newPage: () => {},
    pages: () => {},
    version: () => {},
    ...overrides,
  };
}

describe('Variable', () => {
  describe('constructor — required value', () => {
    it('throws when required but no value (and no default) is provided', () => {
      expect(
        () => new Variable({ type: 'string', name: 'myVar', required: true } as any)
      ).toThrow('Variable "myVar" is required but has no value.');
    });

    it('throws when required and value is explicitly null', () => {
      expect(
        () => new Variable({ type: 'string', name: 'myVar', required: true, value: null } as any)
      ).toThrow('Variable "myVar" is required but has no value.');
    });

    it('succeeds when required and a value is provided', () => {
      const variable = new Variable({
        type: 'string',
        name: 'myVar',
        required: true,
        value: 'hello',
      } as any);

      expect(variable.getValue()).toBe('hello');
      expect(variable.isRequired()).toBe(true);
    });
  });

  describe('constructor — default values per type when optional and unset', () => {
    it('defaults string to empty string', () => {
      const variable = new Variable({ type: 'string', name: 'v' } as any);
      expect(variable.getValue()).toBe('');
    });

    it('defaults number to 0', () => {
      const variable = new Variable({ type: 'number', name: 'v' } as any);
      expect(variable.getValue()).toBe(0);
    });

    it('defaults boolean to false', () => {
      const variable = new Variable({ type: 'boolean', name: 'v' } as any);
      expect(variable.getValue()).toBe(false);
    });

    it('defaults array to []', () => {
      const variable = new Variable({ type: 'array', name: 'v' } as any);
      expect(variable.getValue()).toEqual([]);
    });

    it('defaults object to {}', () => {
      const variable = new Variable({ type: 'object', name: 'v' } as any);
      expect(variable.getValue()).toEqual({});
    });

    it('defaults date to a real Date instance (from a fresh ISO string, then coerced)', () => {
      const variable = new Variable({ type: 'date', name: 'v' } as any);
      expect(variable.getValue()).toBeInstanceOf(Date);
      expect(isNaN((variable.getValue() as Date).getTime())).toBe(false);
    });

    it('defaults deferred/complex types (e.g. dbConnection) to null with no default', () => {
      const variable = new Variable({ type: 'dbConnection', name: 'v' } as any);
      expect(variable.getValue()).toBeNull();
    });
  });

  describe('constructor — type coercion', () => {
    describe('string', () => {
      it('stringifies a non-string value', () => {
        const variable = new Variable({ type: 'string', name: 'v', value: 42 } as any);
        expect(variable.getValue()).toBe('42');
      });
    });

    describe('number', () => {
      it('coerces a numeric string', () => {
        const variable = new Variable({ type: 'number', name: 'v', value: '42' } as any);
        expect(variable.getValue()).toBe(42);
      });

      it('throws for a non-numeric string', () => {
        expect(
          () => new Variable({ type: 'number', name: 'v', value: 'abc' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });
    });

    describe('boolean', () => {
      it('coerces the strings "true"/"false" (case-insensitive)', () => {
        expect(new Variable({ type: 'boolean', name: 'v', value: 'true' } as any).getValue()).toBe(
          true
        );
        expect(new Variable({ type: 'boolean', name: 'v', value: 'FALSE' } as any).getValue()).toBe(
          false
        );
      });

      it('coerces a non-string value via Boolean()', () => {
        expect(new Variable({ type: 'boolean', name: 'v', value: 1 } as any).getValue()).toBe(true);
      });

      it('throws for an unrecognized boolean string', () => {
        expect(
          () => new Variable({ type: 'boolean', name: 'v', value: 'maybe' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });
    });

    describe('date', () => {
      it('coerces a valid date string', () => {
        const variable = new Variable({ type: 'date', name: 'v', value: '2024-01-01' } as any);
        expect(variable.getValue()).toBeInstanceOf(Date);
      });

      it('keeps an existing Date instance as-is', () => {
        const date = new Date('2024-06-01');
        const variable = new Variable({ type: 'date', name: 'v', value: date } as any);
        expect(variable.getValue()).toBe(date);
      });

      it('throws for an invalid date string', () => {
        expect(
          () => new Variable({ type: 'date', name: 'v', value: 'not-a-date' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });

      it('throws for a value that is neither string, number, nor Date', () => {
        expect(
          () => new Variable({ type: 'date', name: 'v', value: {} } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });
    });

    describe('array', () => {
      it('parses a JSON array string', () => {
        const variable = new Variable({ type: 'array', name: 'v', value: '[1,2,3]' } as any);
        expect(variable.getValue()).toEqual([1, 2, 3]);
      });

      it('keeps an existing array as-is', () => {
        const variable = new Variable({ type: 'array', name: 'v', value: [1, 2] } as any);
        expect(variable.getValue()).toEqual([1, 2]);
      });

      it('throws when the JSON string parses to a non-array', () => {
        expect(
          () => new Variable({ type: 'array', name: 'v', value: '{"a":1}' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });

      it('throws for invalid JSON', () => {
        expect(
          () => new Variable({ type: 'array', name: 'v', value: 'not json' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });
    });

    describe('object', () => {
      it('parses a JSON object string', () => {
        const variable = new Variable({ type: 'object', name: 'v', value: '{"a":1}' } as any);
        expect(variable.getValue()).toEqual({ a: 1 });
      });

      it('keeps an existing plain object as-is', () => {
        const variable = new Variable({ type: 'object', name: 'v', value: { a: 1 } } as any);
        expect(variable.getValue()).toEqual({ a: 1 });
      });

      it('throws when the JSON string parses to an array', () => {
        expect(
          () => new Variable({ type: 'object', name: 'v', value: '[1,2]' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });

      it('throws for invalid JSON', () => {
        expect(
          () => new Variable({ type: 'object', name: 'v', value: 'not json' } as any)
        ).toThrow(/Type coercion failed for variable "v"/);
      });
    });
  });

  describe('setValue', () => {
    it('throws when the variable is readonly and does not mutate the value', () => {
      const variable = new Variable({
        type: 'string',
        name: 'locked',
        value: 'orig',
        readonly: true,
      } as any);

      expect(() => variable.setValue('new')).toThrow(
        'Variable "locked" is readonly and cannot be modified.'
      );
      expect(variable.getValue()).toBe('orig');
    });

    it('coerces primitive values on set (e.g. numeric string -> number)', () => {
      const variable = new Variable({ type: 'number', name: 'n', value: 1 } as any);
      variable.setValue('42');
      expect(variable.getValue()).toBe(42);
    });

    it('does not coerce complex/non-primitive types (e.g. browser), preserving reference identity', () => {
      const variable = new Variable({ type: 'browser', name: 'b' } as any);
      const fakeBrowser = makeFakeBrowser();

      variable.setValue(fakeBrowser);

      expect(variable.getValue()).toBe(fakeBrowser);
    });

    it('rolls back to the previous value if the post-set validate() fails', () => {
      const variable = new Variable({ type: 'array', name: 'arr', value: [1, 2, 3] } as any);

      // null bypasses coerceValue's `== null` guard unchanged, but then fails
      // validate() because null is not a valid array value -> should roll back.
      expect(() => variable.setValue(null)).toThrow();
      expect(variable.getValue()).toEqual([1, 2, 3]);
    });

    it('rolls back an invalid complex-type value and keeps the previous one', () => {
      const variable = new Variable({ type: 'browser', name: 'b' } as any);
      const fakeBrowser = makeFakeBrowser();
      variable.setValue(fakeBrowser);

      expect(() => variable.setValue(42 as any)).toThrow();
      expect(variable.getValue()).toBe(fakeBrowser);
    });
  });

  describe('cleanup', () => {
    it('calls value.cleanup() for a video variable', () => {
      const cleanupSpy = { called: false };
      const fakeVideo = makeFakeVideo({
        cleanup: () => {
          cleanupSpy.called = true;
        },
      });
      const variable = new Variable({ type: 'video', name: 'v', value: fakeVideo } as any);

      variable.cleanup();

      expect(cleanupSpy.called).toBe(true);
    });

    it('calls value.cleanup() for an audio variable', () => {
      const cleanupSpy = { called: false };
      const fakeAudio = makeFakeAudio({
        cleanup: () => {
          cleanupSpy.called = true;
        },
      });
      const variable = new Variable({ type: 'audio', name: 'v', value: fakeAudio } as any);

      variable.cleanup();

      expect(cleanupSpy.called).toBe(true);
    });

    it('does NOT call cleanup() for non video/audio types even if a cleanup function is present', () => {
      const cleanupSpy = { called: false };
      const variable = new Variable({
        type: 'object',
        name: 'v',
        value: {
          cleanup: () => {
            cleanupSpy.called = true;
          },
        },
      } as any);

      variable.cleanup();

      expect(cleanupSpy.called).toBe(false);
    });

    it('does nothing (no throw) when there is no value or no cleanup function', () => {
      const variable = new Variable({ type: 'string', name: 'v', value: 'x' } as any);
      expect(() => variable.cleanup()).not.toThrow();
    });
  });

  describe('toObject', () => {
    it('round-trips all fields', () => {
      const variable = new Variable({
        type: 'string',
        name: 'roundtrip',
        value: 'hello',
        description: 'a description',
        readonly: true,
        required: true,
        scope: 'global',
        secret: true,
        visibility: 'private',
      } as any);

      expect(variable.toObject()).toEqual({
        type: 'string',
        name: 'roundtrip',
        value: 'hello',
        description: 'a description',
        readonly: true,
        required: true,
        scope: 'global',
        secret: true,
        visibility: 'private',
      });
    });

    it('applies defaults for readonly/required/scope/secret/visibility when omitted', () => {
      const variable = new Variable({ type: 'string', name: 'defaults', value: 'x' } as any);

      const obj = variable.toObject();
      expect(obj.readonly).toBe(false);
      expect(obj.required).toBe(false);
      expect(obj.scope).toBe('task');
      expect(obj.secret).toBe(false);
      expect(obj.visibility).toBe('private');
      expect(obj).not.toHaveProperty('output');
    });

    it('keeps output: true', () => {
      const variable = new Variable({ type: 'string', name: 'out', value: '', output: true } as any);
      expect(variable.isOutput()).toBe(true);
      expect(variable.toObject().output).toBe(true);
    });
  });

  describe('getters', () => {
    it('expose the parsed fields', () => {
      const variable = new Variable({
        type: 'number',
        name: 'n',
        value: 5,
        description: 'desc',
      } as any);

      expect(variable.getName()).toBe('n');
      expect(variable.getType()).toBe('number');
      expect(variable.getDescription()).toBe('desc');
      expect(variable.isReadonly()).toBe(false);
      expect(variable.isRequired()).toBe(false);
      expect(variable.getScope()).toBe('task');
      expect(variable.isSecret()).toBe(false);
      expect(variable.getVisibility()).toBe('private');
      expect(variable.isOutput()).toBe(false);
    });
  });

  describe('static create', () => {
    it('creates a Variable instance equivalent to `new Variable(...)`', () => {
      const variable = Variable.create({ type: 'string', name: 'v', value: 'hi' } as any);

      expect(variable).toBeInstanceOf(Variable);
      expect(variable.getValue()).toBe('hi');
      expect(variable.getName()).toBe('v');
    });
  });

  describe('static validate', () => {
    it('returns true for a valid variable object', () => {
      expect(Variable.validate({ type: 'number', name: 'n', value: 5 } as any)).toBe(true);
    });

    it('returns false for a variable object with a value that does not match its type', () => {
      expect(Variable.validate({ type: 'number', name: 'n', value: 'not-a-number' } as any)).toBe(
        false
      );
    });

    it('returns false for a required variable with no value', () => {
      expect(Variable.validate({ type: 'string', name: 'n', required: true } as any)).toBe(false);
    });

    it('returns false for an invalid variable name', () => {
      expect(
        Variable.validate({ type: 'string', name: 'not a valid name!', value: 'x' } as any)
      ).toBe(false);
    });
  });
});

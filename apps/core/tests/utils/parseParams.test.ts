import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { globalsRead, globalsReadByStep, parseParams, parseStepParams } from '@utils/parseParams';

function makeVar(name: string, value: any) {
  return {
    getName: () => name,
    getValue: () => value,
  };
}

describe('parseParams', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // restore process.env between tests
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  describe('no-op cases', () => {
    it('does nothing for null params', () => {
      expect(() => parseParams(null, [])).not.toThrow();
      expect(parseParams(null, [])).toBeUndefined();
    });

    it('does nothing for undefined params', () => {
      expect(() => parseParams(undefined, [])).not.toThrow();
    });
  });

  describe('raw injection: {= varName =}', () => {
    it('preserves the original type: number', () => {
      const params: any = { n: '{= num =}' };
      parseParams(params, [makeVar('num', 42)]);
      expect(params.n).toBe(42);
    });

    it('preserves the original type: array', () => {
      const arr = [1, 2, 3];
      const params: any = { a: '{= arr =}' };
      parseParams(params, [makeVar('arr', arr)]);
      expect(params.a).toBe(arr);
    });

    it('preserves the original type: object', () => {
      const obj = { a: 1 };
      const params: any = { o: '{= obj =}' };
      parseParams(params, [makeVar('obj', obj)]);
      expect(params.o).toBe(obj);
    });

    it('returns the original literal string when the variable is not found', () => {
      const params: any = { m: '{= missing =}' };
      parseParams(params, []);
      expect(params.m).toBe('{= missing =}');
    });

    it('throws when {= var =} is mixed with other text (must be the entire string)', () => {
      const params: any = { x: 'prefix {= var =} suffix' };
      expect(() => parseParams(params, [makeVar('var', 1)])).toThrow(
        /must be used alone and not inside other strings/
      );
    });

    describe('{= _env.KEY =}', () => {
      it('injects the raw env variable', () => {
        process.env.TEST_RAW_ENV = 'env-value';
        const params: any = { e: '{= _env.TEST_RAW_ENV =}' };
        parseParams(params, []);
        expect(params.e).toBe('env-value');
      });

      it('returns the original literal string when the env var is unset', () => {
        delete process.env.TEST_UNSET_ENV;
        const params: any = { e: '{= _env.TEST_UNSET_ENV =}' };
        parseParams(params, []);
        expect(params.e).toBe('{= _env.TEST_UNSET_ENV =}');
      });
    });

    describe('{= _global.name =}', () => {
      it('injects the raw global variable via the getGlobalVar callback', () => {
        const getGlobalVar = vi.fn((name: string) => (name === 'apiKey' ? 'secret123' : undefined));
        const params: any = { g: '{= _global.apiKey =}' };

        parseParams(params, [], getGlobalVar);

        expect(params.g).toBe('secret123');
        expect(getGlobalVar).toHaveBeenCalledWith('apiKey');
      });

      it('returns the original literal string when getGlobalVar is not provided', () => {
        const params: any = { g: '{= _global.apiKey =}' };
        parseParams(params, []);
        expect(params.g).toBe('{= _global.apiKey =}');
      });

      it('returns the original literal string when the global variable resolves to null/undefined', () => {
        const getGlobalVar = vi.fn(() => undefined);
        const params: any = { g: '{= _global.missing =}' };
        parseParams(params, [], getGlobalVar);
        expect(params.g).toBe('{= _global.missing =}');
      });
    });

    describe('{= _previous =}', () => {
      it('injects the entire previous result, preserving its type', () => {
        const prev = { field: 'value' };
        const params: any = { p: '{= _previous =}' };
        parseParams(params, [], undefined, prev);
        expect(params.p).toBe(prev);
      });

      it('resolves a nested field via dot notation', () => {
        const prev = { myField: 'hello' };
        const params: any = { p: '{= _previous.myField =}' };
        parseParams(params, [], undefined, prev);
        expect(params.p).toBe('hello');
      });

      it('resolves a nested path with array index and property access', () => {
        const prev = { list: [{ prop: 'hello' }] };
        const params: any = { p: '{= _previous.list[0].prop =}' };
        parseParams(params, [], undefined, prev);
        expect(params.p).toBe('hello');
      });

      it('returns the original literal string when there is no previous result', () => {
        const params: any = { p: '{= _previous.myField =}' };
        parseParams(params, []);
        expect(params.p).toBe('{= _previous.myField =}');
      });

      it('returns the original literal string when the path resolves to null/undefined mid-way', () => {
        const prev = { list: [] as any[] };
        const params: any = { p: '{= _previous.list[0].prop =}' };
        parseParams(params, [], undefined, prev);
        expect(params.p).toBe('{= _previous.list[0].prop =}');
      });
    });

    describe('dot / bracket path traversal', () => {
      it('resolves a nested path with array index and property access', () => {
        const obj = { list: [{ prop: 'hello' }] };
        const params: any = { p: '{= obj.list[0].prop =}' };

        parseParams(params, [makeVar('obj', obj)]);

        expect(params.p).toBe('hello');
      });

      it('returns the original literal string when the path resolves to null/undefined mid-way', () => {
        const obj = { list: [] as any[] };
        const params: any = { p: '{= obj.list[0].prop =}' };

        parseParams(params, [makeVar('obj', obj)]);

        expect(params.p).toBe('{= obj.list[0].prop =}');
      });

      it('resolves a simple dot path', () => {
        const obj = { name: 'Tipeline' };
        const params: any = { p: '{= obj.name =}' };

        parseParams(params, [makeVar('obj', obj)]);

        expect(params.p).toBe('Tipeline');
      });
    });
  });

  describe('LiquidJS interpolation: {{ }}', () => {
    it('interpolates a plain variable', () => {
      const params: any = { greeting: 'Hello {{ name }}!' };
      parseParams(params, [makeVar('name', 'World')]);
      expect(params.greeting).toBe('Hello World!');
    });

    it('interpolates {{ _env.KEY }}', () => {
      process.env.TEST_LIQUID_ENV = 'abc123';
      const params: any = { url: 'key={{ _env.TEST_LIQUID_ENV }}' };
      parseParams(params, []);
      expect(params.url).toBe('key=abc123');
    });

    it('interpolates {{ _global.name }} via getGlobalVar', () => {
      const getGlobalVar = vi.fn((name: string) => (name === 'username' ? 'jose' : undefined));
      const params: any = { msg: 'User: {{ _global.username }}' };
      parseParams(params, [], getGlobalVar);
      expect(params.msg).toBe('User: jose');
    });

    it('interpolates {{ _previous.field }} with the previous action result', () => {
      const params: any = { msg: 'Got: {{ _previous.myField }}' };
      parseParams(params, [], undefined, { myField: 'world' });
      expect(params.msg).toBe('Got: world');
    });

    it('resolves {{ _previous.field }} to empty when there is no previous result', () => {
      const params: any = { msg: 'Got: {{ _previous.myField }}' };
      parseParams(params, []);
      expect(params.msg).toBe('Got: ');
    });

    it('does not populate the _previous context when the value has no "_previous" reference', () => {
      const params: any = { msg: '{{ name }}' };
      parseParams(params, [makeVar('name', 'Alice')], undefined, { myField: 'unused' });
      expect(params.msg).toBe('Alice');
    });

    it('supports conditional syntax', () => {
      const params: any = { result: '{% if flag %}yes{% else %}no{% endif %}' };
      parseParams(params, [makeVar('flag', true)]);
      expect(params.result).toBe('yes');

      const params2: any = { result: '{% if flag %}yes{% else %}no{% endif %}' };
      parseParams(params2, [makeVar('flag', false)]);
      expect(params2.result).toBe('no');
    });

    it('supports filters', () => {
      const params: any = { upper: '{{ name | upcase }}' };
      parseParams(params, [makeVar('name', 'bob')]);
      expect(params.upper).toBe('BOB');
    });
  });

  describe('disabled tags', () => {
    it.each(['layout', 'include', 'render', 'extends', 'block'])(
      'throws when the "%s" tag is used',
      (tag) => {
        const params: any = { x: `{% ${tag} %}` };
        expect(() => parseParams(params, [])).toThrow(
          `The '${tag}' tag is not supported in Tipeline templates.`
        );
      }
    );
  });

  describe('recursion', () => {
    it('recurses into nested plain objects', () => {
      const params: any = {
        config: {
          url: '{= host =}',
          nested: { flag: '{{ enabled }}' },
        },
      };

      parseParams(params, [makeVar('host', 'example.com'), makeVar('enabled', true)]);

      expect(params.config.url).toBe('example.com');
      expect(params.config.nested.flag).toBe('true');
    });

    it('resolves string elements inside a top-level array', () => {
      const params: any = { list: ['{= a =}', 'static text'] };

      parseParams(params, [makeVar('a', 99)]);

      expect(params.list[0]).toBe(99);
      expect(params.list[1]).toBe('static text');
    });

    it('recurses into an object nested inside an array element', () => {
      const params: any = { list: [{ inner: '{= a =}' }] };

      parseParams(params, [makeVar('a', 99)]);

      expect(params.list[0].inner).toBe(99);
    });

    it('recurses into an array nested inside an array element', () => {
      const params: any = { list: [['{= a =}', 'static']] };

      parseParams(params, [makeVar('a', 99)]);

      expect(params.list[0]).toEqual([99, 'static']);
    });
  });

  describe('pass-through for non-string/array/object values', () => {
    it('leaves numbers, booleans, and null untouched', () => {
      const params: any = { count: 42, flag: true, empty: null };
      parseParams(params, []);

      expect(params).toEqual({ count: 42, flag: true, empty: null });
    });
  });
});

describe('parseStepParams', () => {
  const variables = [makeVar('name', 'Ann')];

  it('leaves the steps inside a flow step unresolved', () => {
    const params: any = { firstOperand: '{{ name }}', actions: [{ params: { text: '{{ name }}' } }] };
    parseStepParams('flow', params, variables);
    expect(params.firstOperand).toBe('Ann');
    expect(params.actions).toEqual([{ params: { text: '{{ name }}' } }]);
  });

  it('resolves an actions param of any other group', () => {
    const params: any = { actions: [{ text: '{{ name }}' }] };
    parseStepParams('browser', params, variables);
    expect(params.actions).toEqual([{ text: 'Ann' }]);
  });
});

describe('globalsRead', () => {
  const names = (value: unknown) => [...globalsRead(value)];

  it('finds both template forms, in text and nested values', () => {
    expect(names({ a: '{= _global.one =}', b: ['x {{ _global.two }} y', { c: '{{_global.three}}' }] })).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('counts filters as reading the global, except default', () => {
    expect(names('{{ _global.one | upcase }}')).toEqual(['one']);
    expect(names("{{ _global.one | default: 'x' }}")).toEqual([]);
  });

  it('ignores tags and text that only mentions a global', () => {
    expect(names('{% if _global.one %}yes{% endif %}')).toEqual([]);
    expect(names('see _global.one in the docs')).toEqual([]);
  });

  it('skips the steps inside a flow step, for that step only', () => {
    const params = { firstOperand: '{{ _global.one }}', actions: [{ params: { a: '{{ _global.two }}' } }] };
    expect(globalsReadByStep('flow', params)).toEqual(['one']);
    expect(globalsReadByStep('browser', params)).toEqual(['one', 'two']);
  });
});

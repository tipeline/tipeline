import { describe, expect, it } from 'vitest';
import { getGroupActions, getGroupValidations } from '@tipeline/schemas';
import {
  defaultVariableType,
  matchesVariableType,
  TEXT_VARIABLE_TYPES,
} from '@/components/ui/auto-form/utils';

describe('matchesVariableType', () => {
  it('takes one type, a list of types, or none', () => {
    expect(matchesVariableType('image')).toBe(true);
    expect(matchesVariableType('image', [])).toBe(true);
    expect(matchesVariableType('image', 'image')).toBe(true);
    expect(matchesVariableType('string', 'image')).toBe(false);
    expect(matchesVariableType('array', ['string', 'array'])).toBe(true);
    expect(matchesVariableType('object', ['string', 'array'])).toBe(false);
  });
});

// A param that takes a variable's value — an image, a connection, an object — but is
// typed as a string in the step form would get `{{ x }}` from the {} menu, and reach
// core as text. Each one is marked as a value field, offering only its own type.
describe('action params that take a variable value', () => {
  const expected: Record<string, { param: string; type: string | string[] }> = {
    image: { param: 'image', type: 'image' },
    audio: { param: 'audio', type: 'audio' },
    video: { param: 'video', type: 'video' },
    object: { param: 'object', type: 'object' },
    browser: { param: 'browser', type: 'browser' },
  };

  for (const [group, { param, type }] of Object.entries(expected)) {
    it(`${group}: every "${param}" param is a ${type} value field`, () => {
      const validations = getGroupValidations(group as any) as Record<
        string,
        any
      >;
      const withParam = getGroupActions(group as any).filter(
        (name) => validations[name]?.runtime?.fieldConfig?.[param]
      );
      expect(withParam.length).toBeGreaterThan(0);
      for (const name of withParam) {
        const config = validations[name].runtime.fieldConfig[param];
        expect({
          name,
          valueField: config.valueField,
          variableType: config.variableType,
        }).toEqual({
          name,
          valueField: true,
          variableType: type,
        });
      }
    });
  }

  it('connections, workbooks, For Each and recipient lists are typed too', () => {
    const config = (group: string, name: string, param: string) =>
      (getGroupValidations(group as any) as any)[name].runtime.fieldConfig[
        param
      ];
    expect(config('http', 'downloadFile', 'browser')).toMatchObject({ valueField: true, variableType: 'browser' });
    expect(config('database', 'query', 'connection')).toMatchObject({
      valueField: true,
      variableType: 'dbConnection',
    });
    expect(config('ssh', 'exec', 'connection')).toMatchObject({
      valueField: true,
      variableType: 'sshConnection',
    });
    expect(config('ssh', 'connect', 'config')).toMatchObject({
      valueField: true,
      variableType: 'object',
    });
    expect(config('spreadsheet', 'save', 'workbook')).toMatchObject({
      valueField: true,
      variableType: 'workbook',
    });
    expect(config('api', 'auth', 'token')).toMatchObject({
      variableType: 'oauthToken',
    });
    expect(config('flow', 'forEachLoop', 'iterable')).toMatchObject({
      valueField: true,
      variableType: 'array',
    });
    for (const param of ['to', 'cc', 'bcc'])
      expect(config('email', 'send', param)).toMatchObject({
        valueField: true,
        variableType: ['string', 'array'],
      });
    expect(config('browser', 'setSelectState', 'value')).toMatchObject({
      valueField: true,
      variableType: ['string', 'array'],
    });
  });
});

// A text or number param with no variableType of its own used to list every variable —
// objects, browsers, images — in its {} menu. It now offers what its Zod type fits.
describe('defaultVariableType', () => {
  it('text fields offer text-like values, number fields numbers', () => {
    expect(defaultVariableType('ZodString')).toEqual(TEXT_VARIABLE_TYPES);
    expect(defaultVariableType('ZodString', { component: 'textarea-variable' })).toEqual(TEXT_VARIABLE_TYPES);
    expect(defaultVariableType('ZodNumber')).toBe('number');
  });

  it('keeps an explicit type, value fields, any params and special pickers as they are', () => {
    expect(defaultVariableType('ZodString', { variableType: 'image' })).toBe('image');
    expect(defaultVariableType('ZodString', { valueField: true })).toBeUndefined();
    expect(defaultVariableType('ZodAny')).toBeUndefined();
    expect(defaultVariableType('ZodString', { component: 'variable-select' })).toBeUndefined();
    expect(defaultVariableType('ZodString', { component: 'datestring' })).toBeUndefined();
    expect(defaultVariableType('ZodString', { component: 'codemirror-template' })).toBeUndefined();
  });
});

describe('typed params that the schema shape alone gets wrong', () => {
  const fieldConfig = (group: string) =>
    Object.entries(getGroupValidations(group as any) as Record<string, any>).map(
      ([name, v]) => [name, v.runtime.fieldConfig ?? {}] as const
    );

  it('string: the text a step works on offers only string variables', () => {
    const params = ['string', 'search', 'target', 'pattern', 'replacement', 'separator', 'flag'];
    let checked = 0;
    for (const [name, config] of fieldConfig('string'))
      for (const param of params)
        if (config[param]) {
          checked++;
          expect({ name, param, type: config[param].variableType }).toEqual({ name, param, type: 'string' });
        }
    expect(checked).toBeGreaterThan(30);
  });

  it('math: operands typed as template text offer only number variables', () => {
    // locale is text; real number fields and number lists are typed by their own field.
    const notNumbers = new Set(['locale', 'array', 'minimumFractionDigits', 'maximumFractionDigits']);
    let checked = 0;
    for (const [name, config] of fieldConfig('math'))
      for (const [param, c] of Object.entries<any>(config))
        if (!notNumbers.has(param)) {
          checked++;
          expect({ name, param, type: c.variableType }).toEqual({ name, param, type: 'number' });
        }
    expect(checked).toBeGreaterThan(20);
  });

  it('object references and the SMTP port', () => {
    const config = (group: string, name: string, param: string) =>
      (getGroupValidations(group as any) as any)[name].runtime.fieldConfig[param];
    expect(config('api', 'invoke', 'endpoints').variableType).toBe('object');
    expect(config('browser', 'stopScreencast', 'recorder').variableType).toBe('object');
    expect(config('email', 'send', 'port').variableType).toBe('number');
  });
});

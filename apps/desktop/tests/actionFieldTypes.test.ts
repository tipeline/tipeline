import { describe, expect, it } from 'vitest';
import { getGroupActions, getGroupValidations } from '@tipeline/schemas';
import { matchesVariableType } from '@/components/ui/auto-form/utils';

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

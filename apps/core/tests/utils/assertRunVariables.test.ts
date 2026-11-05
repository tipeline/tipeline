import { describe, expect, it } from 'vitest';
import { assertRunVariables } from '@utils/assertPropsVisibility';

const declared = [
  { name: 'who', visibility: 'public' },
  { name: 'level', visibility: 'protected' },
  { name: 'inner', visibility: 'private' },
  { name: 'unset' },
];

describe('assertRunVariables', () => {
  it('accepts what the workflow takes', () => {
    expect(() => assertRunVariables(declared, { who: 'a', level: 1 })).not.toThrow();
  });

  it('names what it does take when a name is wrong', () => {
    expect(() => assertRunVariables(declared, { whoo: 'a' })).toThrow(
      'This workflow has no variable "whoo". It takes: who, level.'
    );
  });

  it.each(['inner', 'unset'])('refuses private variable %s, which is the default', (name) => {
    expect(() => assertRunVariables(declared, { [name]: 'x' })).toThrow('is private');
  });

  it('lets a resume correct a private variable, but still not a made-up one', () => {
    expect(() => assertRunVariables(declared, { inner: 'x' }, { allowPrivate: true })).not.toThrow();
    expect(() => assertRunVariables(declared, { nope: 'x' }, { allowPrivate: true })).toThrow('no variable');
  });
});

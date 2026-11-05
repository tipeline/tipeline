import { describe, expect, it } from 'vitest';
import { coreVersionWarning } from '../src/coreVersionWarning';

describe('coreVersionWarning', () => {
  it('stays quiet when they match', () => {
    expect(coreVersionWarning('0.2.0', '0.2.0')).toBeNull();
  });

  it('stays quiet when Core is too old to say its version here', () => {
    expect(coreVersionWarning('0.2.0', undefined)).toBeNull();
  });

  it('tells an older CLI to update', () => {
    expect(coreVersionWarning('0.1.0', '0.2.0')).toContain('npm i -g @tipeline/cli');
  });

  it('tells a newer CLI to restart Core', () => {
    expect(coreVersionWarning('0.2.0', '0.1.0')).toContain('tipeline stop, then tipeline start');
  });
});

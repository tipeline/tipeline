import { describe, expect, it } from 'vitest';
import { isOlderVersion } from '../src/version';

describe('isOlderVersion', () => {
  it.each([
    ['1.0.0', '1.0.1'],
    ['1.0.9', '1.1.0'],
    ['1.9.0', '2.0.0'],
    ['1.9.0', '1.10.0'],
  ])('%s is older than %s', (running, bundled) => {
    expect(isOlderVersion(running, bundled)).toBe(true);
  });

  it.each([
    ['1.0.0', '1.0.0'],
    ['1.1.0', '1.0.9'],
    ['2.0.0', '1.9.0'],
  ])('%s is not older than %s', (running, bundled) => {
    expect(isOlderVersion(running, bundled)).toBe(false);
  });

  it.each([
    [undefined, '1.0.0'],
    ['1.0.0', undefined],
    ['unknown', '1.0.0'],
  ])(
    'never reports an update for a version it cannot read (%s, %s)',
    (running, bundled) => {
      expect(isOlderVersion(running, bundled)).toBe(false);
    }
  );
});

import { describe, expect, it } from 'vitest';
import { parseThemeMode, resolveDark } from '../src/theme';

describe('theme', () => {
  it('system follows the phone; light and dark ignore it', () => {
    expect(resolveDark('system', true)).toBe(true);
    expect(resolveDark('system', false)).toBe(false);
    expect(resolveDark('light', true)).toBe(false);
    expect(resolveDark('dark', false)).toBe(true);
  });

  it('reads a saved choice, falling back to system', () => {
    expect(parseThemeMode('dark')).toBe('dark');
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode(null)).toBe('system');
    expect(parseThemeMode('sepia')).toBe('system');
  });
});

import { describe, expect, it } from 'vitest';
import en from '@tipeline/i18n/locales/en/mobile.json';
import es from '@tipeline/i18n/locales/es/mobile.json';
import { preferredLocale } from '../src/i18n';
import { normalizeServerUrl } from '../src/session';

const keys = (o: any, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const strings = (o: any): string[] => Object.values(o).flatMap((v) => (v && typeof v === 'object' ? strings(v) : [String(v)]));

describe('translations', () => {
  it('Spanish has every English key', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it('use no unescaped vue-i18n special characters (@ | and only {name} placeholders)', () => {
    for (const s of [...strings(en), ...strings(es)]) {
      expect(s).not.toMatch(/[@|]/);
      expect(s.replace(/\{[a-zA-Z]+\}/g, '')).not.toMatch(/[{}]/);
    }
  });
});

describe('preferredLocale', () => {
  it('takes the first language the app has', () => {
    expect(preferredLocale(['es-MX', 'en-US'])).toBe('es');
    expect(preferredLocale(['fr-FR', 'es'])).toBe('es');
    expect(preferredLocale(['en-GB', 'es'])).toBe('en');
    expect(preferredLocale(['de'])).toBe('en');
    expect(preferredLocale([])).toBe('en');
  });
});

describe('normalizeServerUrl', () => {
  it('adds https to a bare host and drops a trailing slash', () => {
    expect(normalizeServerUrl(' tipeline.acme.dev/ ')).toBe('https://tipeline.acme.dev');
    expect(normalizeServerUrl('http://localhost:4011')).toBe('http://localhost:4011');
    expect(normalizeServerUrl('wss://a.dev')).toBe('wss://a.dev');
    expect(normalizeServerUrl('')).toBe('');
  });
});

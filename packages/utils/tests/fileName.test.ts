import { describe, it, expect } from 'vitest';
import { fileSlug, readableFileNames } from '../src/fileName';

describe('fileSlug', () => {
  it('lowercases and joins words with dashes', () => {
    expect(fileSlug('Invoice Report (Monthly)', 'workflow')).toBe('invoice-report-monthly');
  });

  it('strips accents instead of breaking the word', () => {
    expect(fileSlug('Facturación electrónica', 'workflow')).toBe('facturacion-electronica');
  });

  it('falls back when nothing usable is left', () => {
    expect(fileSlug('', 'workflow')).toBe('workflow');
    expect(fileSlug(null, 'app')).toBe('app');
    expect(fileSlug('🚀 !!', 'app')).toBe('app');
  });

  it('keeps long names to a readable length without a trailing dash', () => {
    const slug = fileSlug(`${'a'.repeat(59)} b c`, 'workflow');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('readableFileNames', () => {
  it('names each item after its name', () => {
    const names = readableFileNames(
      [
        { identifier: 'Xy12abcDEF', name: 'Send Mail' },
        { identifier: 'Qr34ghiJKL', name: 'CRM sync' },
      ],
      'workflow'
    );
    expect([...names]).toEqual([
      ['Xy12abcDEF', 'send-mail'],
      ['Qr34ghiJKL', 'crm-sync'],
    ]);
  });

  it('adds the start of the identifier to every item whose name clashes', () => {
    const names = readableFileNames(
      [
        { identifier: 'Ab12cdEFgh', name: 'Report' },
        { identifier: 'Zz99yyXXww', name: 'report!' },
        { identifier: 'Mm00nnOOpp', name: 'Other' },
      ],
      'workflow'
    );
    expect(names.get('Ab12cdEFgh')).toBe('report-ab12cd');
    expect(names.get('Zz99yyXXww')).toBe('report-zz99yy');
    expect(names.get('Mm00nnOOpp')).toBe('other');
  });

  it('uses the whole identifier when the starts match too', () => {
    const names = readableFileNames(
      [
        { identifier: 'abcdef111', name: 'Report' },
        { identifier: 'abcdef222', name: 'Report' },
      ],
      'workflow'
    );
    expect(names.get('abcdef111')).toBe('report-abcdef');
    expect(names.get('abcdef222')).toBe('report-abcdef222');
  });

  it('never repeats a name, even against one that already reads like a suffixed name', () => {
    const items = [
      { identifier: 'abcdef1', name: 'Report' },
      { identifier: 'abcdef2', name: 'Report' },
      { identifier: 'x', name: 'report-abcdef' },
    ];
    const names = [...readableFileNames(items, 'workflow').values()];
    expect(new Set(names).size).toBe(items.length);
  });

  it('gives unnamed items the fallback, told apart when there are several', () => {
    const names = readableFileNames(
      [
        { identifier: 'one111', name: '' },
        { identifier: 'two222', name: null },
      ],
      'app'
    );
    expect(names.get('one111')).toBe('app-one111');
    expect(names.get('two222')).toBe('app-two222');
  });
});

import { describe, it, expect } from 'vitest';
import { descriptionSummary, markdownToText } from '../src/markdown';

const DESCRIPTION = `## About
Syncs **orders** from [Shopify](https://shopify.com) into \`orders.csv\`.

- Step *one*
- Step two
  1. nested a
  2. nested b
- [x] done

> needs an API key`;

describe('descriptionSummary', () => {
  it('uses the first paragraph as plain text, without link addresses', () => {
    expect(descriptionSummary(DESCRIPTION)).toBe('Syncs orders from Shopify into orders.csv.');
  });

  it('keeps plain-text descriptions as they were, on one line', () => {
    expect(descriptionSummary('Backs up the\ndatabase nightly')).toBe(
      'Backs up the database nightly'
    );
  });

  it('falls back to the first block when there is no paragraph', () => {
    expect(descriptionSummary('- one\n- two')).toBe('• one • two');
    expect(descriptionSummary('# Title only')).toBe('Title only');
  });

  it('is empty for missing descriptions', () => {
    expect(descriptionSummary(undefined)).toBe('');
    expect(descriptionSummary(null)).toBe('');
    expect(descriptionSummary('   ')).toBe('');
  });

  it('shows raw HTML and escapes as written text', () => {
    expect(descriptionSummary('a <b>b</b> \\*c\\*')).toBe('a <b>b</b> *c*');
  });
});

describe('markdownToText', () => {
  it('keeps structure: bullets, numbering, tasks, quotes and link addresses', () => {
    expect(markdownToText(DESCRIPTION)).toBe(
      [
        'About',
        'Syncs orders from Shopify (https://shopify.com) into orders.csv.',
        '• Step one\n• Step two\n  1. nested a\n  2. nested b\n[x] done',
        '│ needs an API key',
      ].join('\n\n')
    );
  });

  it('shows only the address when the link text is the address', () => {
    expect(markdownToText('<https://example.com>')).toBe('https://example.com');
  });

  it('applies the given style', () => {
    const style = {
      strong: (s: string) => `B(${s})`,
      em: (s: string) => `I(${s})`,
      code: (s: string) => `C(${s})`,
      heading: (s: string) => `H(${s})`,
      link: (text: string, href: string) => `L(${text}|${href})`,
    };
    expect(markdownToText('# T\n\n**b** *i* `c` [l](https://x.y)', style)).toBe(
      'H(T)\n\nB(b) I(i) C(c) L(l|https://x.y)'
    );
  });
});

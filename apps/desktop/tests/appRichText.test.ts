// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fromEditorHtml, toEditorHtml } from '@/utils/appRichText';

const html =
  '<h2>Invoice</h2><p>Hi <strong>Ana</strong>, see <a href="https://example.com" target="_blank">this</a> — <em>thanks</em> <u>really</u>.</p>' +
  '<ul><li><p>one</p></li><li><p>two</p></li></ul><blockquote><p>quoted</p></blockquote><p><code>x = 1</code></p>';

describe('rich text values', () => {
  it('HTML is kept as the editor gives it; an empty editor is ""', () => {
    expect(fromEditorHtml(html, false, 'html')).toBe(html);
    expect(fromEditorHtml('<p></p>', true, 'html')).toBe('');
    expect(fromEditorHtml('<p></p>', true, 'markdown')).toBe('');
  });

  it('Markdown: headings, emphasis, links, lists, quotes and code (underline stays HTML)', () => {
    expect(fromEditorHtml(html, false, 'markdown')).toBe(
      ['## Invoice', '', 'Hi **Ana**, see [this](https://example.com) — *thanks* <u>really</u>.', '', '- one', '- two', '', '> quoted', '', '`x = 1`'].join('\n')
    );
  });

  it('values coming in: Markdown becomes HTML', () => {
    expect(toEditorHtml('## Hi\n\n**bold** and [x](https://example.com)', 'markdown')).toContain('<strong>bold</strong>');
    // (Text first: under happy-dom DOMPurify drops the first element — not in a browser.)
    expect(toEditorHtml('Intro\n\n## Hi', 'markdown')).toContain('<h2>Hi</h2>');
    expect(fromEditorHtml('<ol><li><p>a</p></li><li><p>b</p></li></ol>', false, 'markdown')).toBe('1. a\n2. b');
    // Cleaning HTML that comes in is checked in a real browser (DOMPurify doesn't run
    // properly under happy-dom); the editor also drops anything it doesn't know.
    expect(toEditorHtml(null)).toBe('');
  });
});

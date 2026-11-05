// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/utils/appMarkdown';

describe('renderMarkdown', () => {
  // Under happy-dom, DOMPurify drops the tag of the very first element (a happy-dom
  // quirk; real Chromium keeps it — checked in the browser), so this starts with text.
  it('renders headings, emphasis, lists, code, tables and line breaks', () => {
    const html = renderMarkdown('Intro\n\n# Title\n\n**bold** and *it*\nnext line\n\n- one\n- two\n\n`x`\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong> and <em>it</em><br>next line');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>x</code>');
    expect(html).toContain('<td>1</td>');
  });

  it('shows raw HTML as text — values from bindings can never inject markup', () => {
    const html = renderMarkdown('Hi <img src=x onerror="alert(1)"> <b>there</b>\n\n<script>alert(1)</script>');
    expect(html).not.toMatch(/<img|<b>|<script/);
    expect(html).toContain('&lt;b&gt;there&lt;/b&gt;');
  });

  it('opens http(s) / mailto links outside the app; other links stay text', () => {
    const html = renderMarkdown('[docs](https://example.com "Docs") [mail](mailto:a@b.c) [bad](javascript:alert(1)) [file](file:///etc/passwd)');
    expect(html).toContain('<a href="https://example.com" title="Docs" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(html).toContain('href="mailto:a@b.c"');
    expect(html).not.toMatch(/javascript:|file:/);
    expect(html).toContain('bad');
  });

  it('shows https and inline images only', () => {
    expect(renderMarkdown('![logo](https://example.com/a.png)')).toContain('<img src="https://example.com/a.png" alt="logo">');
    expect(renderMarkdown('![x](http://example.com/a.png)')).not.toContain('<img');
    expect(renderMarkdown('![x](file:///a.png)')).not.toContain('<img');
  });
});

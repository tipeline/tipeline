import TurndownService from 'turndown';
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/utils/appMarkdown';

// A rich text input's value is HTML (default) or Markdown — what a workflow wants for
// an email body or a document. The editor itself always works in HTML, so the value
// is converted on the way in and out. Coming in, it is sanitized (it may be a default
// or a binding holding anything); the editor then keeps only what it knows anyway.

export type RichTextFormat = 'html' | 'markdown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});
// <u> has no Markdown: keep it as HTML (most Markdown readers accept it).
turndown.keep(['u']);
// List items as "- one" / "1. one" (turndown's own rule pads the marker to 4 columns).
turndown.addRule('listItem', {
  filter: 'li',
  replacement(content, node, options) {
    const text = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n  ');
    const parent = node.parentNode as HTMLElement | null;
    let marker = `${options.bulletListMarker} `;
    if (parent?.nodeName === 'OL') {
      const start = Number(parent.getAttribute('start') ?? 1);
      marker = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
    }
    return marker + text + (node.nextSibling && !/\n$/.test(text) ? '\n' : '');
  },
});

// The editor wraps each list item's text in a <p>: a single one is just the item's text
// (otherwise the list comes out "loose", with blank lines between items).
const unwrapListParagraphs = (html: string) => html.replace(/<li><p>((?:(?!<\/?p>|<\/?li>).)*)<\/p><\/li>/g, '<li>$1</li>');

/** The editor's HTML for a stored value. */
export function toEditorHtml(value: unknown, format: RichTextFormat = 'html'): string {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (!text.trim()) return '';
  if (format === 'markdown') return renderMarkdown(text);
  return DOMPurify.sanitize(text, { ADD_ATTR: ['target'] });
}

/** The value to store for the editor's HTML ("" when it's empty). */
export function fromEditorHtml(html: string, isEmpty: boolean, format: RichTextFormat = 'html'): string {
  if (isEmpty) return '';
  return format === 'markdown' ? turndown.turndown(unwrapListParagraphs(html)).trim() : html;
}

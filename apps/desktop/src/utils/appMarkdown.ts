import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';

// Markdown for app text components. The text usually carries bindings, so it can hold
// anything a workflow returned: it is rendered as Markdown only — raw HTML is shown as
// text, links and images only go to safe places — and the result is sanitized again.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LINK = /^(https?:|mailto:)/i;
const IMAGE = /^(https:|data:image\/(png|jpe?g|gif|webp);)/i;

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // `<b>hi</b>` in the text shows as written, never as HTML.
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    // Links open in the system browser (Electron sends target=_blank there); anything
    // but http(s) / mailto stays plain text.
    link(this: any, token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!LINK.test(token.href)) return text;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${escapeHtml(token.href)}"${title} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image(token: Tokens.Image) {
      if (!IMAGE.test(token.href)) return escapeHtml(token.text);
      return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}">`;
    },
  },
});

/** Markdown → safe HTML for `v-html`. */
export function renderMarkdown(source: string): string {
  const html = md.parse(source ?? '', { async: false }) as string;
  // Links and images are already limited to safe places above; DOMPurify's own URL
  // rules stay as a second line. (A custom ALLOWED_URI_REGEXP would also be applied to
  // values like target="_blank" and rel="noopener", and strip them.)
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

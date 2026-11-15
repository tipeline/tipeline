import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';

// The Assistant's answers, as Markdown: the same rules as Desktop's (appMarkdown.ts). Raw
// HTML shows as text, links only go to http(s) and mailto, and the result is sanitized
// again. Images aren't shown in a chat answer.

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LINK = /^(https?:|mailto:)/i;

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    link(this: any, token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!LINK.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    image(token: Tokens.Image) {
      return escapeHtml(token.text);
    },
  },
});

/** Markdown → safe HTML for `v-html`. */
export function renderMarkdown(source: string): string {
  const html = md.parse(source ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

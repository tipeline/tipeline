import { Lexer, type Token, type Tokens } from 'marked';

// Workflow, app and project descriptions are Markdown. Desktop renders them as HTML on
// detail pages; everywhere else (list rows, cards, search, the CLI) they are shown as text,
// which is what these helpers produce.

export interface MarkdownTextStyle {
  strong?: (text: string) => string;
  em?: (text: string) => string;
  code?: (text: string) => string;
  heading?: (text: string) => string;
  /** Default: `text (href)`, or just the address when the text is the address. */
  link?: (text: string, href: string) => string;
}

type Style = Required<MarkdownTextStyle>;

const same = (text: string) => text;
const plainLink = (text: string, href: string) =>
  !text || text === href || `mailto:${text}` === href ? href : `${text} (${href})`;

function withDefaults(style: MarkdownTextStyle = {}): Style {
  return {
    strong: style.strong ?? same,
    em: style.em ?? same,
    code: style.code ?? same,
    heading: style.heading ?? same,
    link: style.link ?? plainLink,
  };
}

function inline(tokens: Token[] | undefined, style: Style): string {
  return (tokens ?? [])
    .map((token): string => {
      switch (token.type) {
        case 'strong':
          return style.strong(inline(token.tokens, style));
        case 'em':
          return style.em(inline(token.tokens, style));
        case 'codespan':
          return style.code(token.text);
        case 'link':
          return style.link(inline(token.tokens, style), token.href);
        case 'image':
          return token.text;
        case 'br':
          return '\n';
        default:
          if ('tokens' in token && token.tokens?.length) return inline(token.tokens, style);
          return 'text' in token ? String(token.text) : '';
      }
    })
    .join('');
}

const indent = (text: string, by: string) => text.replace(/\n/g, `\n${by}`);

/** One entry per block; a list is one entry with its items on separate lines. */
function blocks(tokens: Token[], style: Style): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;
      case 'paragraph':
        out.push(inline(token.tokens, style));
        break;
      case 'text':
        out.push(token.tokens?.length ? inline(token.tokens, style) : token.text);
        break;
      case 'heading':
        out.push(style.heading(inline(token.tokens, style)));
        break;
      case 'list': {
        const list = token as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        const items = list.items.map((item, i) => {
          const bullet = item.task
            ? item.checked
              ? '[x] '
              : '[ ] '
            : list.ordered
              ? `${start + i}. `
              : '• ';
          const body = blocks(item.tokens, style).join('\n');
          return bullet + indent(body, ' '.repeat(bullet.length));
        });
        out.push(items.join('\n'));
        break;
      }
      case 'blockquote':
        out.push('│ ' + indent(blocks(token.tokens ?? [], style).join('\n\n'), '│ '));
        break;
      case 'code':
        out.push(
          token.text
            .split('\n')
            .map((line: string) => '  ' + style.code(line))
            .join('\n')
        );
        break;
      case 'table': {
        const table = token as Tokens.Table;
        const row = (cells: Tokens.TableCell[]) =>
          cells.map((cell) => inline(cell.tokens, style)).join(' | ');
        out.push([row(table.header), ...table.rows.map(row)].join('\n'));
        break;
      }
      case 'hr':
        out.push('───');
        break;
      default:
        if ('text' in token && token.text) out.push(String(token.text).trim());
    }
  }
  return out.filter((block) => block.trim() !== '');
}

const lex = (markdown: string | null | undefined) => Lexer.lex(markdown ?? '', { gfm: true });

/**
 * Markdown → readable text: lists keep their bullets, links show their address, blocks
 * are separated by a blank line. `style` lets a terminal add bold, colours, etc.
 */
export function markdownToText(
  markdown: string | null | undefined,
  style?: MarkdownTextStyle
): string {
  return blocks(lex(markdown), withDefaults(style)).join('\n\n');
}

/**
 * The one-line version of a Markdown description for lists, cards and tables: the first
 * paragraph (or, without one, the first block) as plain text, without link addresses.
 */
export function descriptionSummary(markdown: string | null | undefined): string {
  const tokens = lex(markdown);
  const style = withDefaults({ link: same });
  const paragraph = tokens.find((token): token is Tokens.Paragraph => token.type === 'paragraph');
  const text = paragraph ? inline(paragraph.tokens, style) : (blocks(tokens, style)[0] ?? '');
  return text.replace(/\s+/g, ' ').trim();
}

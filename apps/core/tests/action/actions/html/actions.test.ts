import { describe, expect, it } from 'vitest';
import { GroupHTML } from '@/action/actions/html/actions';

const SAMPLE_HTML = `
<html>
  <body>
    <h1 id="title" class="heading">Welcome</h1>
    <p class="intro" data-role="lead">Hello <b>world</b></p>
    <ul class="items">
      <li>Apple</li>
      <li>Banana</li>
      <li>Cherry pending</li>
    </ul>
    <nav>
      <a href="/home">Home</a>
      <a href="/about">About</a>
    </nav>
    <table id="pricing">
      <thead>
        <tr><th>Plan</th><th>Price</th></tr>
      </thead>
      <tbody>
        <tr><td>Basic</td><td>$10</td></tr>
        <tr><td>Pro</td><td>$20</td></tr>
      </tbody>
    </table>
    <script>console.log('remove me');</script>
  </body>
</html>
`;

describe('GroupHTML', () => {
  describe('getElement', () => {
    it('returns the trimmed text of the first matching element by default', () => {
      expect(GroupHTML.getElement({ html: SAMPLE_HTML, selector: 'h1' } as any)).toBe('Welcome');
    });

    it('returns an attribute value when requested', () => {
      expect(
        GroupHTML.getElement({ html: SAMPLE_HTML, selector: 'h1', attribute: 'id' } as any)
      ).toBe('title');
    });

    it('returns innerHTML when requested', () => {
      expect(
        GroupHTML.getElement({ html: SAMPLE_HTML, selector: '.intro', attribute: 'innerHTML' } as any)
      ).toContain('<b>world</b>');
    });

    it('returns null when no element matches', () => {
      expect(GroupHTML.getElement({ html: SAMPLE_HTML, selector: '.does-not-exist' } as any)).toBeNull();
    });

    it('throws a validation error when html is missing', () => {
      expect(() => GroupHTML.getElement({ selector: 'h1' } as any)).toThrow();
    });

    it('throws a validation error for a disallowed attribute value', () => {
      expect(() =>
        GroupHTML.getElement({ html: SAMPLE_HTML, selector: 'h1', attribute: 'onclick' } as any)
      ).toThrow();
    });
  });

  describe('getElements', () => {
    it('returns text for every matching element', () => {
      expect(GroupHTML.getElements({ html: SAMPLE_HTML, selector: '.items li' } as any)).toEqual([
        'Apple',
        'Banana',
        'Cherry pending',
      ]);
    });

    it('returns an attribute for every matching element', () => {
      expect(
        GroupHTML.getElements({ html: SAMPLE_HTML, selector: 'nav a', attribute: 'href' } as any)
      ).toEqual(['/home', '/about']);
    });

    it('returns an empty array when nothing matches', () => {
      expect(GroupHTML.getElements({ html: SAMPLE_HTML, selector: '.missing' } as any)).toEqual([]);
    });

    it('throws a validation error when selector is missing', () => {
      expect(() => GroupHTML.getElements({ html: SAMPLE_HTML } as any)).toThrow();
    });
  });

  describe('elementExists', () => {
    it('returns true when the selector matches an element', () => {
      expect(GroupHTML.elementExists({ html: SAMPLE_HTML, selector: '#title' } as any)).toBe(true);
    });

    it('returns false when the selector matches nothing', () => {
      expect(GroupHTML.elementExists({ html: SAMPLE_HTML, selector: '.missing' } as any)).toBe(false);
    });

    it('throws a validation error when html is an empty string', () => {
      expect(() => GroupHTML.elementExists({ html: '', selector: 'h1' } as any)).toThrow();
    });
  });

  describe('countElements', () => {
    it('counts the number of matching elements', () => {
      expect(GroupHTML.countElements({ html: SAMPLE_HTML, selector: '.items li' } as any)).toBe(3);
    });

    it('returns 0 when nothing matches', () => {
      expect(GroupHTML.countElements({ html: SAMPLE_HTML, selector: '.missing' } as any)).toBe(0);
    });

    it('throws a validation error when selector is missing', () => {
      expect(() => GroupHTML.countElements({ html: SAMPLE_HTML } as any)).toThrow();
    });
  });

  describe('getLinks', () => {
    it('extracts all links from the document when no selector is given', () => {
      expect(GroupHTML.getLinks({ html: SAMPLE_HTML } as any)).toEqual([
        { text: 'Home', href: '/home' },
        { text: 'About', href: '/about' },
      ]);
    });

    it('scopes link extraction to a container selector', () => {
      expect(GroupHTML.getLinks({ html: SAMPLE_HTML, selector: 'nav' } as any)).toEqual([
        { text: 'Home', href: '/home' },
        { text: 'About', href: '/about' },
      ]);
    });

    it('returns an empty array when the container has no links', () => {
      expect(GroupHTML.getLinks({ html: SAMPLE_HTML, selector: '.items' } as any)).toEqual([]);
    });

    it('throws a validation error when html is missing', () => {
      expect(() => GroupHTML.getLinks({} as any)).toThrow();
    });
  });

  describe('tableToJson', () => {
    it('converts a table with a thead into an array of row objects', () => {
      expect(GroupHTML.tableToJson({ html: SAMPLE_HTML, selector: '#pricing' } as any)).toEqual([
        { Plan: 'Basic', Price: '$10' },
        { Plan: 'Pro', Price: '$20' },
      ]);
    });

    it('returns an empty array when the selector matches no table', () => {
      expect(GroupHTML.tableToJson({ html: SAMPLE_HTML, selector: '#missing-table' } as any)).toEqual(
        []
      );
    });

    it('throws a validation error when selector is missing', () => {
      expect(() => GroupHTML.tableToJson({ html: SAMPLE_HTML } as any)).toThrow();
    });
  });

  describe('extractData', () => {
    it('extracts multiple fields using a selector map', () => {
      expect(
        GroupHTML.extractData({
          html: SAMPLE_HTML,
          schema: { title: 'h1', intro: '.intro' },
        } as any)
      ).toEqual({ title: 'Welcome', intro: 'Hello world' });
    });

    it('returns an empty string for fields whose selector does not match', () => {
      expect(
        GroupHTML.extractData({ html: SAMPLE_HTML, schema: { missing: '.nope' } } as any)
      ).toEqual({ missing: '' });
    });

    it('throws a validation error when schema is not an object of strings', () => {
      expect(() =>
        GroupHTML.extractData({ html: SAMPLE_HTML, schema: { title: 123 } } as any)
      ).toThrow();
    });
  });

  describe('removeElements', () => {
    it('removes matching elements and returns the cleaned HTML', () => {
      const result = GroupHTML.removeElements({ html: SAMPLE_HTML, selector: 'script' } as any);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<h1');
    });

    it('leaves the HTML unchanged (aside from removal) when selector matches nothing', () => {
      const result = GroupHTML.removeElements({ html: SAMPLE_HTML, selector: '.missing' } as any);
      expect(result).toContain('Welcome');
    });

    it('throws a validation error when selector is missing', () => {
      expect(() => GroupHTML.removeElements({ html: SAMPLE_HTML } as any)).toThrow();
    });
  });

  describe('getHtml', () => {
    it('returns innerHTML by default', () => {
      const result = GroupHTML.getHtml({ html: SAMPLE_HTML, selector: '.intro' } as any);
      expect(result).toContain('<b>world</b>');
      expect(result).not.toContain('class="intro"');
    });

    it('returns outerHTML when outer is true', () => {
      const result = GroupHTML.getHtml({ html: SAMPLE_HTML, selector: '.intro', outer: true } as any);
      expect(result).toContain('class="intro"');
    });

    it('returns null when no element matches', () => {
      expect(GroupHTML.getHtml({ html: SAMPLE_HTML, selector: '.missing' } as any)).toBeNull();
    });

    it('throws a validation error when html is missing', () => {
      expect(() => GroupHTML.getHtml({ selector: '.intro' } as any)).toThrow();
    });
  });

  describe('findByText', () => {
    it('returns the trimmed text of elements containing the substring', () => {
      expect(
        GroupHTML.findByText({ html: SAMPLE_HTML, selector: 'li', text: 'pending' } as any)
      ).toEqual(['Cherry pending']);
    });

    it('returns an empty array when nothing matches the text', () => {
      expect(
        GroupHTML.findByText({ html: SAMPLE_HTML, selector: 'li', text: 'not-there' } as any)
      ).toEqual([]);
    });

    it('throws a validation error when text is an empty string', () => {
      expect(() =>
        GroupHTML.findByText({ html: SAMPLE_HTML, selector: 'li', text: '' } as any)
      ).toThrow();
    });

    it('throws a validation error when selector is missing', () => {
      expect(() => GroupHTML.findByText({ html: SAMPLE_HTML, text: 'pending' } as any)).toThrow();
    });
  });
});

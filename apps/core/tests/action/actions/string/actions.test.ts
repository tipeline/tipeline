import { describe, expect, it } from 'vitest';
import { GroupString } from '@/action/actions/string/actions';

describe('GroupString', () => {
  describe('camelCase', () => {
    it('converts a space-separated string to camelCase', () => {
      expect(GroupString.camelCase({ string: 'Send Daily Report' })).toBe('sendDailyReport');
    });

    it('handles an already camelCased single word', () => {
      expect(GroupString.camelCase({ string: 'report' })).toBe('report');
    });

    it('coerces a numeric input to a string', () => {
      expect(GroupString.camelCase({ string: 42 as any })).toBe('42');
    });

    it('throws when string is an object', () => {
      expect(() => GroupString.camelCase({ string: { a: 1 } as any })).toThrow();
    });
  });

  describe('capitalize', () => {
    it('capitalizes the first letter and lowercases the rest', () => {
      expect(GroupString.capitalize({ string: 'hELLO' })).toBe('Hello');
    });

    it('handles an empty string', () => {
      expect(GroupString.capitalize({ string: '' })).toBe('');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.capitalize({} as any)).toThrow();
    });
  });

  describe('kebabCase', () => {
    it('converts a space-separated string to kebab-case', () => {
      expect(GroupString.kebabCase({ string: 'Send Daily Report' })).toBe('send-daily-report');
    });

    it('collapses non-alphanumeric separators', () => {
      expect(GroupString.kebabCase({ string: 'foo__bar--baz' })).toBe('foo-bar-baz');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.kebabCase({} as any)).toThrow();
    });
  });

  describe('lowerFirst', () => {
    it('lowercases only the first character', () => {
      expect(GroupString.lowerFirst({ string: 'SendDailyReport' })).toBe('sendDailyReport');
    });

    it('handles an empty string', () => {
      expect(GroupString.lowerFirst({ string: '' })).toBe('');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.lowerFirst({} as any)).toThrow();
    });
  });

  describe('snakeCase', () => {
    it('converts a space-separated string to snake_case', () => {
      expect(GroupString.snakeCase({ string: 'Send Daily Report' })).toBe('send_daily_report');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.snakeCase({} as any)).toThrow();
    });
  });

  describe('startCase', () => {
    it('capitalizes each word', () => {
      expect(GroupString.startCase({ string: 'send daily report' })).toBe('Send Daily Report');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.startCase({} as any)).toThrow();
    });
  });

  describe('toLowerCase', () => {
    it('lowercases the entire string', () => {
      expect(GroupString.toLowerCase({ string: 'RUNNING' })).toBe('running');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.toLowerCase({} as any)).toThrow();
    });
  });

  describe('toUpperCase', () => {
    it('uppercases the entire string', () => {
      expect(GroupString.toUpperCase({ string: 'running' })).toBe('RUNNING');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.toUpperCase({} as any)).toThrow();
    });
  });

  describe('upperFirst', () => {
    it('uppercases only the first character', () => {
      expect(GroupString.upperFirst({ string: 'sendDailyReport' })).toBe('SendDailyReport');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.upperFirst({} as any)).toThrow();
    });
  });

  describe('endsWith', () => {
    it('returns true when the string ends with the search value', () => {
      expect(GroupString.endsWith({ string: 'SalesPipeline', search: 'Pipeline' })).toBe(true);
    });

    it('respects a custom end position', () => {
      expect(GroupString.endsWith({ string: 'Pipeline123', search: 'Pipeline', position: 8 })).toBe(
        true
      );
    });

    it('returns false when the string does not end with the search value', () => {
      expect(GroupString.endsWith({ string: 'SalesPipeline', search: 'Task' })).toBe(false);
    });

    it('throws when search is missing', () => {
      expect(() => GroupString.endsWith({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('includes', () => {
    it('returns true when the substring is present', () => {
      expect(GroupString.includes({ string: 'Send Daily Report', search: 'Report' })).toBe(true);
    });

    it('respects the start position', () => {
      expect(GroupString.includes({ string: 'abcabc', search: 'abc', position: 1 })).toBe(true);
      expect(GroupString.includes({ string: 'abcabc', search: 'abc', position: 4 })).toBe(false);
    });

    it('throws when search is missing', () => {
      expect(() => GroupString.includes({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('indexOf', () => {
    it('returns the index of the first occurrence', () => {
      expect(GroupString.indexOf({ string: 'Sales Report Sales', search: 'Sales' })).toBe(0);
    });

    it('returns -1 when not found', () => {
      expect(GroupString.indexOf({ string: 'abc', search: 'z' })).toBe(-1);
    });

    it('throws when search is missing', () => {
      expect(() => GroupString.indexOf({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('startsWith', () => {
    it('returns true when the string starts with the target', () => {
      expect(GroupString.startsWith({ string: 'SendDailyReport', target: 'Send' })).toBe(true);
    });

    it('respects the start position', () => {
      expect(GroupString.startsWith({ string: 'abcabc', target: 'abc', position: 3 })).toBe(true);
    });

    it('throws when target is missing', () => {
      expect(() => GroupString.startsWith({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('containsRegex', () => {
    it('returns true when the pattern matches', () => {
      expect(GroupString.containsRegex({ string: 'send report', pattern: '^[a-z\\s]+$' })).toBe(
        true
      );
    });

    it('returns false when the pattern does not match', () => {
      expect(GroupString.containsRegex({ string: 'Send Report', pattern: '^[a-z\\s]+$' })).toBe(
        false
      );
    });

    it('throws when pattern is missing', () => {
      expect(() => GroupString.containsRegex({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('match', () => {
    it('returns all matches for a global pattern', () => {
      expect(
        GroupString.match({ string: 'SendDailyReport', pattern: '[A-Z][a-z]+', flag: 'g' })
      ).toEqual(['Send', 'Daily', 'Report']);
    });

    it('returns null when there is no match', () => {
      expect(GroupString.match({ string: 'abc', pattern: '[0-9]+' })).toBeNull();
    });

    it('throws when pattern is missing', () => {
      expect(() => GroupString.match({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('search', () => {
    it('returns the index of the first match', () => {
      expect(GroupString.search({ string: 'pipeline-run-00427-completed', pattern: '\\d+' })).toBe(
        13
      );
    });

    it('returns -1 when there is no match', () => {
      expect(GroupString.search({ string: 'abc', pattern: '\\d+' })).toBe(-1);
    });

    it('throws when pattern is missing', () => {
      expect(() => GroupString.search({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('replace', () => {
    it('replaces only the first occurrence', () => {
      expect(
        GroupString.replace({
          string: 'Pipeline status: pending. Retry pending.',
          pattern: 'pending',
          replacement: 'running',
        })
      ).toBe('Pipeline status: running. Retry pending.');
    });

    it('replaces with an empty string when replacement is omitted', () => {
      expect(GroupString.replace({ string: 'abc123', pattern: '123' } as any)).toBe('abc');
    });

    it('throws when pattern is missing', () => {
      expect(() => GroupString.replace({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('replaceAll', () => {
    it('replaces every occurrence', () => {
      expect(
        GroupString.replaceAll({
          string: 'task.name, task.status, task.owner',
          pattern: 'task.',
          replacement: 'pipeline.',
        })
      ).toBe('pipeline.name, pipeline.status, pipeline.owner');
    });

    it('returns the original string when the pattern is not found', () => {
      expect(GroupString.replaceAll({ string: 'abc', pattern: 'z', replacement: 'y' })).toBe(
        'abc'
      );
    });

    it('throws when pattern is missing', () => {
      expect(() => GroupString.replaceAll({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('slice', () => {
    it('extracts a substring from a start index', () => {
      expect(GroupString.slice({ string: 'string.camelCase', start: 7 })).toBe('camelCase');
    });

    it('extracts a substring between start and end', () => {
      expect(GroupString.slice({ string: 'abcdef', start: 1, end: 3 })).toBe('bc');
    });

    it('supports a negative start index', () => {
      expect(GroupString.slice({ string: 'abcdef', start: -2 })).toBe('ef');
    });

    it('throws when start is missing', () => {
      expect(() => GroupString.slice({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('split', () => {
    it('splits a string into parts by separator', () => {
      expect(GroupString.split({ string: 'pdf,invoice,ocr,email', separator: ',' })).toEqual([
        'pdf',
        'invoice',
        'ocr',
        'email',
      ]);
    });

    it('respects a limit on the number of parts', () => {
      expect(GroupString.split({ string: 'a,b,c', separator: ',', limit: 2 })).toEqual(['a', 'b']);
    });

    it('splits into characters when the separator is empty', () => {
      expect(GroupString.split({ string: 'abc', separator: '' })).toEqual(['a', 'b', 'c']);
    });

    it('throws when separator is missing', () => {
      expect(() => GroupString.split({ string: 'abc' } as any)).toThrow();
    });
  });

  describe('substring', () => {
    it('extracts a substring by start and end indices', () => {
      expect(GroupString.substring({ string: 'string.camelCase', start: 0, end: 6 })).toBe(
        'string'
      );
    });

    it('swaps start and end when start is greater (native String.substring behavior)', () => {
      expect(GroupString.substring({ string: 'abcdef', start: 4, end: 1 })).toBe('bcd');
    });

    it('throws when end is missing', () => {
      expect(() => GroupString.substring({ string: 'abc', start: 0 } as any)).toThrow();
    });
  });

  describe('words', () => {
    it('splits a string into whitespace-separated words', () => {
      expect(GroupString.words({ string: 'Send Daily Report' } as any)).toEqual([
        'Send',
        'Daily',
        'Report',
      ]);
    });

    it('returns an empty array for a blank string', () => {
      expect(GroupString.words({ string: '   ' } as any)).toEqual([]);
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.words({} as any)).toThrow();
    });
  });

  describe('trim', () => {
    it('removes leading and trailing whitespace', () => {
      expect(GroupString.trim({ string: '  Send Daily Report  ' })).toBe('Send Daily Report');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.trim({} as any)).toThrow();
    });
  });

  describe('trimEnd', () => {
    it('removes only trailing whitespace', () => {
      expect(GroupString.trimEnd({ string: '  Pipeline completed   ' })).toBe(
        '  Pipeline completed'
      );
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.trimEnd({} as any)).toThrow();
    });
  });

  describe('trimStart', () => {
    it('removes only leading whitespace', () => {
      expect(GroupString.trimStart({ string: '   extract invoice data' })).toBe(
        'extract invoice data'
      );
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.trimStart({} as any)).toThrow();
    });
  });

  describe('len', () => {
    it('returns the character length of a string', () => {
      expect(GroupString.len({ string: 'Send Daily Report' })).toBe(17);
    });

    it('returns 0 for an empty string', () => {
      expect(GroupString.len({ string: '' })).toBe(0);
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.len({} as any)).toThrow();
    });
  });

  describe('stringify', () => {
    it('returns strings unchanged', () => {
      expect(GroupString.stringify({ value: 'hello' })).toBe('hello');
    });

    it('stringifies an object compactly by default', () => {
      expect(GroupString.stringify({ value: { a: 1 } })).toBe('{"a":1}');
    });

    it('pretty-prints an object when requested', () => {
      expect(GroupString.stringify({ value: { a: 1 }, pretty: true, indent: 2 })).toBe(
        '{\n  "a": 1\n}'
      );
    });

    it('stringifies null and undefined via String()', () => {
      expect(GroupString.stringify({ value: null })).toBe('null');
      expect(GroupString.stringify({ value: undefined })).toBe('undefined');
    });
  });

  describe('format', () => {
    it('interpolates values into a template', () => {
      expect(
        GroupString.format({
          template: 'Task "{task}" finished with status {status}.',
          values: { task: 'Send Daily Report', status: 'completed' },
        })
      ).toBe('Task "Send Daily Report" finished with status completed.');
    });

    it('leaves unknown placeholders untouched', () => {
      expect(GroupString.format({ template: 'Hello {name}', values: {} })).toBe('Hello {name}');
    });

    it('throws when template is missing', () => {
      expect(() => GroupString.format({ values: {} } as any)).toThrow();
    });
  });

  describe('encodeHTMLEntities', () => {
    it('escapes special HTML characters', () => {
      expect(GroupString.encodeHTMLEntities({ string: `<a href="x">'y'</a> & co` })).toBe(
        '&lt;a href=&quot;x&quot;&gt;&#39;y&#39;&lt;/a&gt; &amp; co'
      );
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.encodeHTMLEntities({} as any)).toThrow();
    });
  });

  describe('decodeHTMLEntities', () => {
    it('decodes HTML entities back to their original characters', () => {
      expect(
        GroupString.decodeHTMLEntities({
          string: '&lt;a href=&quot;x&quot;&gt;&#39;y&#39;&lt;/a&gt; &amp; co',
        })
      ).toBe(`<a href="x">'y'</a> & co`);
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.decodeHTMLEntities({} as any)).toThrow();
    });
  });

  describe('encodeURIComponent', () => {
    it('percent-encodes reserved characters', () => {
      expect(GroupString.encodeURIComponent({ string: 'Send Daily Report - Sales' })).toBe(
        'Send%20Daily%20Report%20-%20Sales'
      );
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.encodeURIComponent({} as any)).toThrow();
    });
  });

  describe('decodeURIComponent', () => {
    it('decodes a percent-encoded string', () => {
      expect(
        GroupString.decodeURIComponent({ string: 'Send%20Daily%20Report%20-%20Sales' })
      ).toBe('Send Daily Report - Sales');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.decodeURIComponent({} as any)).toThrow();
    });
  });

  describe('parseQueryString', () => {
    it('parses a query string into an object', () => {
      expect(
        GroupString.parseQueryString({
          string: 'status=running&tags[]=pdf&tags[]=invoice&limit=10',
        })
      ).toEqual({ status: 'running', tags: ['pdf', 'invoice'], limit: '10' });
    });

    it('returns an empty object for an empty string', () => {
      expect(GroupString.parseQueryString({ string: '' })).toEqual({});
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.parseQueryString({} as any)).toThrow();
    });
  });

  describe('stringifyQueryObject', () => {
    it('serializes an object into a query string', () => {
      expect(
        GroupString.stringifyQueryObject({ object: { status: 'completed', limit: 10 } })
      ).toBe('status=completed&limit=10');
    });

    it('repeats array values instead of using bracket notation', () => {
      expect(GroupString.stringifyQueryObject({ object: { tags: ['pdf', 'invoice'] } })).toBe(
        'tags=pdf&tags=invoice'
      );
    });

    it('throws when object is missing', () => {
      expect(() => GroupString.stringifyQueryObject({} as any)).toThrow();
    });
  });

  describe('slugify', () => {
    it('creates a URL-friendly slug from a plain string', () => {
      expect(GroupString.slugify({ string: 'Hello World' })).toBe('hello-world');
    });

    it('strips accents', () => {
      expect(GroupString.slugify({ string: 'café' })).toBe('cafe');
    });

    it('throws when string is missing', () => {
      expect(() => GroupString.slugify({} as any)).toThrow();
    });
  });

  describe('renderTemplate', () => {
    it('renders a template with loops, conditions and filters', () => {
      const html = GroupString.renderTemplate({
        template:
          '<h1>{{ node.title }}</h1>{% if node.image %}<img src="{{ node.image.url }}">{% endif %}' +
          '{% for tag in node.tags %}<a href="{{ tag.url }}">{{ tag.name }}</a>{% unless forloop.last %}, {% endunless %}{% endfor %}' +
          ' {{ node.created | date: "%Y-%m-%d" }} {{ node.tags | map: "name" | join: "/" }}',
        data: {
          node: {
            title: 'Hello',
            image: null,
            tags: [{ name: 'Drupal', url: '/d' }, { name: 'Tipeline', url: '/t' }],
            created: '2026-10-14T10:00:00Z',
          },
        },
      });
      expect(html).toBe('<h1>Hello</h1><a href="/d">Drupal</a>, <a href="/t">Tipeline</a> 2026-10-14 Drupal/Tipeline');
    });

    it('renders missing values as nothing, and works without data', () => {
      expect(GroupString.renderTemplate({ template: 'a{{ nope.deeper }}b' } as any)).toBe('ab');
    });

    it('reports a broken template as a template error', () => {
      expect(() => GroupString.renderTemplate({ template: '{% if x %}open', data: {} })).toThrow(/^Template error: /);
    });

    it('refuses tags that read files', () => {
      expect(() => GroupString.renderTemplate({ template: "{% include 'x' %}", data: {} })).toThrow(/not supported/);
    });
  });

  describe('template', () => {
    it('returns the content unchanged (values are pre-resolved by the pipeline)', () => {
      expect(GroupString.template({ content: '<h1>Hello {{ name }}</h1>', format: 'html' })).toBe(
        '<h1>Hello {{ name }}</h1>'
      );
    });

    it('defaults format to plain and still returns content unchanged', () => {
      expect(GroupString.template({ content: 'plain text' } as any)).toBe('plain text');
    });

    it('throws when content is missing', () => {
      expect(() => GroupString.template({} as any)).toThrow();
    });
  });
});

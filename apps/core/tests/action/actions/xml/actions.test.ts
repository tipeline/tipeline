import { describe, expect, it } from 'vitest';
import { GroupXML } from '@/action/actions/xml/actions';

const SAMPLE_XML = `
<order id="A-100" status="paid">
  <customer>Jose Daniel Estrada</customer>
  <items>
    <item sku="X1">Widget</item>
    <item sku="X2">Gadget</item>
  </items>
</order>
`;

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tipeline Blog</title>
    <link>https://tipeline.example/blog</link>
    <description>Automation news and updates</description>
    <item>
      <title>Automating Daily Reports</title>
      <link>https://tipeline.example/blog/daily-reports</link>
      <description>How to automate daily reports.</description>
      <pubDate>Wed, 29 Apr 2026 10:00:00 GMT</pubDate>
      <guid>https://tipeline.example/blog/daily-reports</guid>
    </item>
    <item>
      <title>Parsing RSS Feeds</title>
      <link>https://tipeline.example/blog/parsing-rss</link>
      <description>A guide to RSS parsing.</description>
      <pubDate>Thu, 30 Apr 2026 10:00:00 GMT</pubDate>
      <guid>https://tipeline.example/blog/parsing-rss</guid>
    </item>
  </channel>
</rss>
`;

const SAMPLE_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Tipeline Blog</title>
  <subtitle>Automation news and updates</subtitle>
  <link href="https://tipeline.example/blog" rel="alternate" />
  <entry>
    <title>Automating Daily Reports</title>
    <link href="https://tipeline.example/blog/daily-reports" rel="alternate" />
    <summary>How to automate daily reports.</summary>
    <updated>2026-04-29T10:00:00Z</updated>
    <id>https://tipeline.example/blog/daily-reports</id>
  </entry>
</feed>
`;

describe('GroupXML', () => {
  describe('parse', () => {
    it('parses XML into a nested object', () => {
      const result = GroupXML.parse({ xml: SAMPLE_XML } as any);
      expect(result.order.customer).toBe('Jose Daniel Estrada');
      expect(result.order.items.item).toHaveLength(2);
      expect(result.order.items.item[0]).toEqual({ '#text': 'Widget', '@_sku': 'X1' });
    });

    it('keeps attributes as @_-prefixed keys by default', () => {
      const result = GroupXML.parse({ xml: SAMPLE_XML } as any);
      expect(result.order['@_id']).toBe('A-100');
      expect(result.order['@_status']).toBe('paid');
    });

    it('strips attributes when ignoreAttributes is true', () => {
      const result = GroupXML.parse({ xml: SAMPLE_XML, ignoreAttributes: true } as any);
      expect(result.order['@_id']).toBeUndefined();
      expect(result.order.customer).toBe('Jose Daniel Estrada');
    });

    it('throws a validation error when xml is missing', () => {
      expect(() => GroupXML.parse({} as any)).toThrow();
    });

    it('throws a validation error when xml is an empty string', () => {
      expect(() => GroupXML.parse({ xml: '' } as any)).toThrow();
    });
  });

  describe('parseFeed', () => {
    it('normalizes an RSS 2.0 feed', () => {
      const result = GroupXML.parseFeed({ xml: SAMPLE_RSS } as any);
      expect(result.title).toBe('Tipeline Blog');
      expect(result.link).toBe('https://tipeline.example/blog');
      expect(result.description).toBe('Automation news and updates');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        title: 'Automating Daily Reports',
        link: 'https://tipeline.example/blog/daily-reports',
        description: 'How to automate daily reports.',
        pubDate: 'Wed, 29 Apr 2026 10:00:00 GMT',
        guid: 'https://tipeline.example/blog/daily-reports',
      });
    });

    it('normalizes an Atom feed', () => {
      const result = GroupXML.parseFeed({ xml: SAMPLE_ATOM } as any);
      expect(result.title).toBe('Tipeline Blog');
      expect(result.link).toBe('https://tipeline.example/blog');
      expect(result.description).toBe('Automation news and updates');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        title: 'Automating Daily Reports',
        link: 'https://tipeline.example/blog/daily-reports',
        description: 'How to automate daily reports.',
        pubDate: '2026-04-29T10:00:00Z',
        guid: 'https://tipeline.example/blog/daily-reports',
      });
    });

    it('handles a single-item RSS feed without an array', () => {
      const singleItemRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Tipeline Blog</title>
    <link>https://tipeline.example/blog</link>
    <description>Automation news and updates</description>
    <item>
      <title>Automating Daily Reports</title>
      <link>https://tipeline.example/blog/daily-reports</link>
      <description>How to automate daily reports.</description>
      <pubDate>Wed, 29 Apr 2026 10:00:00 GMT</pubDate>
      <guid>https://tipeline.example/blog/daily-reports</guid>
    </item>
  </channel>
</rss>
`;
      const result = GroupXML.parseFeed({ xml: singleItemRss } as any);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Automating Daily Reports');
    });

    it('throws when the root element is neither rss nor feed', () => {
      expect(() => GroupXML.parseFeed({ xml: SAMPLE_XML } as any)).toThrow(
        'Unsupported feed format'
      );
    });

    it('throws a validation error when xml is missing', () => {
      expect(() => GroupXML.parseFeed({} as any)).toThrow();
    });
  });
});

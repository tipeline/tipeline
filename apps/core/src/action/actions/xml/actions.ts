import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type ParseParams = z.infer<typeof validations.xml.parse.runtime.schema>;
type ParseFeedParams = z.infer<typeof validations.xml.parseFeed.runtime.schema>;

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
}

interface Feed {
  title: string;
  link: string;
  description: string;
  items: FeedItem[];
}

// fast-xml-parser returns a single object when an element occurs once, and an
// array when it repeats — this normalizes both shapes to an array.
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Text nodes with attributes are parsed as `{ '#text': '...', '@_attr': '...' }`;
// this unwraps that shape back down to the plain text value.
function textOf(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return String((value as Record<string, unknown>)['#text'] ?? '');
  return String(value);
}

function atomLink(value: unknown): string {
  const links = toArray(value as Record<string, unknown> | Record<string, unknown>[]);
  if (links.length === 0) return '';
  const alternate = links.find((l) => l['@_rel'] === 'alternate' || l['@_rel'] === undefined);
  return String((alternate ?? links[0])['@_href'] ?? '');
}

/**
 * @group Actions
 */
export class GroupXML {
  // --------------------------------------------------
  // Parsing
  // --------------------------------------------------

  /**
   * Parses an XML string into a JSON object.
   *
   * @param params - The input parameters.
   * @param params.xml - XML string to parse.
   * @param params.ignoreAttributes - When `true`, element attributes are stripped from the
   *   result. Defaults to `false`, in which case attributes appear as `@_`-prefixed keys.
   * @returns The parsed document as a plain object.
   * @throws If the input is not well-formed XML.
   * @example
   * ```yaml
   * # Convert a raw XML API response into a workable object
   * - group: xml
   *   name: parse
   *   params:
   *     xml: '{{ responseBody }}'
   * ```
   */
  static parse(params: ParseParams): Record<string, any> {
    const parsed = validations.xml.parse.runtime.validate(params);
    const parser = new XMLParser({
      ignoreAttributes: parsed.ignoreAttributes,
      attributeNamePrefix: '@_',
    });
    return parser.parse(parsed.xml);
  }

  // --------------------------------------------------
  // Feeds
  // --------------------------------------------------

  /**
   * Parses an RSS 2.0 or Atom feed into a normalized object, regardless of which
   * of the two formats the source feed uses.
   *
   * @param params - The input parameters.
   * @param params.xml - Raw RSS or Atom feed XML content to parse.
   * @returns An object with `title`, `link`, `description`, and an `items` array where each
   *   item has `title`, `link`, `description`, `pubDate`, and `guid`.
   * @throws If the input is not well-formed XML, or its root element is neither `<rss>` nor `<feed>`.
   * @example
   * ```yaml
   * # Read the latest posts from a blog's RSS feed
   * - group: xml
   *   name: parseFeed
   *   params:
   *     xml: '{{ feedResponseBody }}'
   * ```
   */
  static parseFeed(params: ParseFeedParams): Feed {
    const parsed = validations.xml.parseFeed.runtime.validate(params);
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const doc = parser.parse(parsed.xml);

    if (doc.rss?.channel) {
      const channel = doc.rss.channel;
      return {
        title: textOf(channel.title),
        link: textOf(channel.link),
        description: textOf(channel.description),
        items: toArray(channel.item).map((item: Record<string, unknown>) => ({
          title: textOf(item.title),
          link: textOf(item.link),
          description: textOf(item.description ?? item['content:encoded']),
          pubDate: textOf(item.pubDate),
          guid: textOf(item.guid),
        })),
      };
    }

    if (doc.feed) {
      const feed = doc.feed;
      return {
        title: textOf(feed.title),
        link: atomLink(feed.link),
        description: textOf(feed.subtitle),
        items: toArray(feed.entry).map((entry: Record<string, unknown>) => ({
          title: textOf(entry.title),
          link: atomLink(entry.link),
          description: textOf(entry.summary ?? entry.content),
          pubDate: textOf(entry.updated ?? entry.published),
          guid: textOf(entry.id),
        })),
      };
    }

    throw new Error('Unsupported feed format: expected an <rss> or <feed> root element');
  }
}

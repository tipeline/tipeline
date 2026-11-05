import * as cheerio from 'cheerio';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type GetElementParams = z.infer<typeof validations.html.getElement.runtime.schema>;
type GetElementsParams = z.infer<typeof validations.html.getElements.runtime.schema>;
type ElementExistsParams = z.infer<typeof validations.html.elementExists.runtime.schema>;
type CountElementsParams = z.infer<typeof validations.html.countElements.runtime.schema>;
type GetLinksParams = z.infer<typeof validations.html.getLinks.runtime.schema>;
type TableToJsonParams = z.infer<typeof validations.html.tableToJson.runtime.schema>;
type ExtractDataParams = z.infer<typeof validations.html.extractData.runtime.schema>;
type RemoveElementsParams = z.infer<typeof validations.html.removeElements.runtime.schema>;
type GetHtmlParams = z.infer<typeof validations.html.getHtml.runtime.schema>;
type FindByTextParams = z.infer<typeof validations.html.findByText.runtime.schema>;
type FromMarkdownParams = z.infer<typeof validations.html.fromMarkdown.runtime.schema>;

/**
 * @group Actions
 */
export class GroupHTML {
  // --------------------------------------------------
  // Element Extraction
  // --------------------------------------------------

  /**
   * Reads text or an attribute from the first matching element.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector targeting the element.
   * @param params.attribute - Attribute to read (`text` by default).
   * @returns The attribute value or trimmed text content, or `null` if no match.
   * @example
   * ```yaml
   * # Extract the page heading from a scraped HTML response
   * - group: html
   *   name: getElement
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: h1
   *     attribute: text
   * ```
   */
  static getElement(params: GetElementParams): string | null {
    const parsed = validations.html.getElement.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    const el = $(parsed.selector).first();
    if (!el.length) return null;
    const attr = parsed.attribute ?? 'text';
    switch (attr) {
      case 'text':
      case 'innerText':
        return el.text().trim();
      case 'innerHTML':
        return el.html();
      case 'outerHTML':
        return $.html(el);
      default:
        return el.attr(attr) ?? null;
    }
  }

  /**
   * Reads text or an attribute from every element matching the selector.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector targeting the elements.
   * @param params.attribute - Attribute to read (`text` by default). Supports `text`,
   *   `innerText`, `innerHTML`, `outerHTML`, and any standard HTML attribute such as
   *   `href`, `src`, `class`, `id`, or `data-*`.
   * @returns An array of non-empty strings, one per matched element.
   * @example
   * ```yaml
   * # Collect every product title from a scraped listing page
   * - group: html
   *   name: getElements
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: .product-title
   *     attribute: text
   * ```
   */
  static getElements(params: GetElementsParams): string[] {
    const parsed = validations.html.getElements.runtime.validate(params);
    const $ = cheerio.load(parsed.html);

    return $(parsed.selector)
      .map((_, el) => {
        const $el = $(el);
        const attr = parsed.attribute || 'text';

        switch (attr) {
          case 'text':
            return $el.text().trim();
          case 'innerText':
            return $el.text().trim(); // Cheerio doesn't distinguish text vs innerText
          case 'innerHTML':
            return $el.html() || '';
          case 'outerHTML':
            return $.html(el) || '';
          // All actual attributes: href, src, class, id, data-*, etc.
          default:
            return $el.attr(attr);
        }
      })
      .get()
      .filter((v): v is string => v !== undefined && v !== '');
  }

  /**
   * Checks whether at least one element matching the selector exists in the HTML.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector to test.
   * @returns `true` if one or more elements match, otherwise `false`.
   * @example
   * ```yaml
   * # Verify that a login form is present in the response HTML
   * - group: html
   *   name: elementExists
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: 'form#login'
   * ```
   */
  static elementExists(params: ElementExistsParams): boolean {
    const parsed = validations.html.elementExists.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    return $(parsed.selector).length > 0;
  }

  /**
   * Returns the number of elements matching the selector.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector targeting the elements to count.
   * @returns The count of matched elements.
   * @example
   * ```yaml
   * # Count how many result rows are on the page
   * - group: html
   *   name: countElements
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: 'table tbody tr'
   * ```
   */
  static countElements(params: CountElementsParams): number {
    const parsed = validations.html.countElements.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    return $(parsed.selector).length;
  }

  // --------------------------------------------------
  // Links & Tables
  // --------------------------------------------------

  /**
   * Extracts all anchor links from the HTML, optionally scoped to a container selector.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - Optional container selector to scope the search (e.g. `nav`).
   * @returns An array of `{ text, href }` objects for every `<a>` found.
   * @example
   * ```yaml
   * # Extract all navigation links from a page
   * - group: html
   *   name: getLinks
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: nav
   * ```
   */
  static getLinks(params: GetLinksParams): { text: string; href: string }[] {
    const parsed = validations.html.getLinks.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    const sel = parsed.selector ? `${parsed.selector} a` : 'a';
    return $(sel)
      .map((_, el) => ({
        text: $(el).text().trim(),
        href: $(el).attr('href') ?? '',
      }))
      .get();
  }

  /**
   * Converts an HTML table into an array of objects keyed by header cells.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector targeting the `<table>` element.
   * @returns An array of row objects; each key maps to a `<th>` header value.
   * @example
   * ```yaml
   * # Parse a pricing table into structured JSON
   * - group: html
   *   name: tableToJson
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: '#pricing-table'
   * ```
   */
  static tableToJson(params: TableToJsonParams): Record<string, string>[] {
    const parsed = validations.html.tableToJson.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    const selector = parsed.selector;

    const headers: string[] = [];
    $(`${selector} thead th, ${selector} tr:first-child th, ${selector} tr:first-child td`).each(
      (_, el) => {
        headers.push($(el).text().trim());
      }
    );

    const rows: Record<string, string>[] = [];
    $(`${selector} tbody tr, ${selector} tr:not(:first-child)`).each((_, row) => {
      const rowData: Record<string, string> = {};
      $(row)
        .find('td')
        .each((i, cell) => {
          rowData[headers[i] || `col${i}`] = $(cell).text().trim();
        });
      if (Object.keys(rowData).length > 0) {
        rows.push(rowData);
      }
    });

    return rows;
  }

  // --------------------------------------------------
  // Structured Data
  // --------------------------------------------------

  /**
   * Extracts multiple values from HTML using a schema that maps field names to CSS selectors.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.schema - An object where each key is the output field name and the value
   *   is the CSS selector whose first match provides the text content.
   * @returns An object with the same keys as `schema`, each holding the extracted text.
   * @example
   * ```yaml
   * # Scrape article metadata from a blog post page
   * - group: html
   *   name: extractData
   *   params:
   *     html: '{{ pageHtml }}'
   *     schema: '{= extractSchema =}'
   * ```
   */
  static extractData(params: ExtractDataParams): Record<string, string> {
    const parsed = validations.html.extractData.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    const result: Record<string, string> = {};
    for (const [key, selector] of Object.entries(parsed.schema)) {
      result[key] = $(selector as string)
        .first()
        .text()
        .trim();
    }
    return result;
  }

  // --------------------------------------------------
  // HTML Manipulation
  // --------------------------------------------------

  /**
   * Removes all elements matching the selector and returns the cleaned HTML string.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector for elements to remove.
   * @returns The full HTML document with the matched elements stripped out.
   * @example
   * ```yaml
   * # Strip all script tags from a scraped page before storing it
   * - group: html
   *   name: removeElements
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: script
   * ```
   */
  static removeElements(params: RemoveElementsParams): string {
    const parsed = validations.html.removeElements.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    $(parsed.selector).remove();
    return $.html();
  }

  /**
   * Returns the inner or outer HTML of the first element matching the selector.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector targeting the element.
   * @param params.outer - When `true`, returns `outerHTML` (includes the element tag itself);
   *   defaults to `false` (returns `innerHTML`).
   * @returns The HTML string of the matched element, or `null` if no match.
   * @example
   * ```yaml
   * # Extract the full outer HTML of the main content block
   * - group: html
   *   name: getHtml
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: '#main-content'
   *     outer: true
   * ```
   */
  static getHtml(params: GetHtmlParams): string | null {
    const parsed = validations.html.getHtml.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    const el = $(parsed.selector).first();
    if (!el.length) return null;
    return parsed.outer ? $.html(el) : el.html();
  }

  // --------------------------------------------------
  // Search
  // --------------------------------------------------

  /**
   * Returns the trimmed text of all elements matching the selector that contain
   * the specified text substring.
   *
   * @param params - The input parameters.
   * @param params.html - Raw HTML string to parse.
   * @param params.selector - CSS selector to narrow the search scope.
   * @param params.text - Substring that must appear in an element's text for it to match.
   * @returns An array of trimmed text strings from all matching elements.
   * @example
   * ```yaml
   * # Find all list items that mention a specific status keyword
   * - group: html
   *   name: findByText
   *   params:
   *     html: '{{ pageHtml }}'
   *     selector: li
   *     text: 'completed'
   * ```
   */
  static findByText(params: FindByTextParams): string[] {
    const parsed = validations.html.findByText.runtime.validate(params);
    const $ = cheerio.load(parsed.html);
    return $(parsed.selector)
      .filter((_, el) => $(el).text().includes(parsed.text))
      .map((_, el) => $(el).text().trim())
      .get();
  }

  // --------------------------------------------------
  // Conversion
  // --------------------------------------------------

  /**
   * Converts Markdown text into HTML.
   *
   * @param params - The input parameters.
   * @param params.markdown - Markdown source text to convert.
   * @param params.sanitize - Strip potentially unsafe HTML (scripts, event handlers) from the
   *   output. Enabled by default — disable only when the markdown source is fully trusted.
   * @param params.inline - Render as an inline fragment instead of a full document, skipping
   *   the wrapping block tags (`<p>`, `<h1>`, etc.). Use for short snippets that will be
   *   inserted into existing HTML. Disabled by default.
   * @returns The rendered HTML string.
   * @example
   * ```yaml
   * # Render a markdown-authored email body as HTML
   * - group: html
   *   name: fromMarkdown
   *   params:
   *     markdown: |
   *       # Hello {{ name }}
   *       Your order **{{ order_id }}** is ready.
   *   output: email_body
   * ```
   * @example
   * ```yaml
   * # Render a single-line snippet with a link, without a wrapping <p>
   * - group: html
   *   name: fromMarkdown
   *   params:
   *     markdown: '[Learn more]({{ url }})'
   *     inline: true
   *   output: link_html
   * ```
   */
  static fromMarkdown(params: FromMarkdownParams): string {
    const parsed = validations.html.fromMarkdown.runtime.validate(params);
    const html = parsed.inline
      ? (marked.parseInline(parsed.markdown, { async: false }) as string)
      : (marked.parse(parsed.markdown, { async: false }) as string);
    return parsed.sanitize ? sanitizeHtml(html) : html;
  }
}

<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# HTML Actions

## General

### `getElement`

Reads text or an attribute from the first matching element.

**Returns:** The attribute value or trimmed text content, or `null` if no match.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to parse and query. |
| `selector` | string | ✓ | — | CSS selector to target the element. |
| `attribute` | string | ✓ | — | Attribute or property to read (e.g. text, href, src, id). |

```yaml
# Extract the page heading from a scraped HTML response
- group: html
  name: getElement
  params:
    html: '{{ pageHtml }}'
    selector: h1
    attribute: text
```

## Element Extraction

### `getElements`

Reads text or an attribute from every element matching the selector.

**Returns:** An array of non-empty strings, one per matched element.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to parse and query. |
| `selector` | string | ✓ | — | CSS selector to match multiple elements. |
| `attribute` | string | ✓ | — | Attribute or property to read from each element (e.g. text, href, src). |

```yaml
# Collect every product title from a scraped listing page
- group: html
  name: getElements
  params:
    html: '{{ pageHtml }}'
    selector: .product-title
    attribute: text
```

### `elementExists`

Checks whether at least one element matching the selector exists in the HTML.

**Returns:** `true` if one or more elements match, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to search. |
| `selector` | string | ✓ | — | CSS selector to check for. |

```yaml
# Verify that a login form is present in the response HTML
- group: html
  name: elementExists
  params:
    html: '{{ pageHtml }}'
    selector: 'form#login'
```

### `countElements`

Returns the number of elements matching the selector.

**Returns:** The count of matched elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to search. |
| `selector` | string | ✓ | — | CSS selector to count matches for. |

```yaml
# Count how many result rows are on the page
- group: html
  name: countElements
  params:
    html: '{{ pageHtml }}'
    selector: 'table tbody tr'
```

### `getLinks`

Extracts all anchor links from the HTML, optionally scoped to a container selector.

**Returns:** An array of `{ text, href }` objects for every `<a>` found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to extract links from. |
| `selector` | string |  | — | Optional CSS selector to scope link extraction (defaults to all anchors). |

```yaml
# Extract all navigation links from a page
- group: html
  name: getLinks
  params:
    html: '{{ pageHtml }}'
    selector: nav
```

## Links & Tables

### `tableToJson`

Converts an HTML table into an array of objects keyed by header cells.

**Returns:** An array of row objects; each key maps to a `<th>` header value.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string containing the table to convert. |
| `selector` | string | ✓ | — | CSS selector targeting the table element. |

```yaml
# Parse a pricing table into structured JSON
- group: html
  name: tableToJson
  params:
    html: '{{ pageHtml }}'
    selector: '#pricing-table'
```

### `extractData`

Extracts multiple values from HTML using a schema that maps field names to CSS selectors.

**Returns:** An object with the same keys as `schema`, each holding the extracted text.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to extract data from. |
| `schema` | Record&lt;string, any&gt; | ✓ | — | Object mapping field names to CSS selectors (e.g. { title: "h1", price: ".price" }). |

```yaml
# Scrape article metadata from a blog post page
- group: html
  name: extractData
  params:
    html: '{{ pageHtml }}'
    schema: '{= extractSchema =}'
```

## Structured Data

### `removeElements`

Removes all elements matching the selector and returns the cleaned HTML string.

**Returns:** The full HTML document with the matched elements stripped out.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to modify. |
| `selector` | string | ✓ | — | CSS selector for elements to remove. |

```yaml
# Strip all script tags from a scraped page before storing it
- group: html
  name: removeElements
  params:
    html: '{{ pageHtml }}'
    selector: script
```

## HTML Manipulation

### `getHtml`

Returns the inner or outer HTML of the first element matching the selector.

**Returns:** The HTML string of the matched element, or `null` if no match.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to query. |
| `selector` | string | ✓ | — | CSS selector targeting the element. |
| `outer` | boolean |  | false | If true, returns the outer HTML including the element itself; otherwise inner HTML. |

```yaml
# Extract the full outer HTML of the main content block
- group: html
  name: getHtml
  params:
    html: '{{ pageHtml }}'
    selector: '#main-content'
    outer: true
```

### `findByText`

Returns the trimmed text of all elements matching the selector that contain
the specified text substring.

**Returns:** An array of trimmed text strings from all matching elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `html` | string | ✓ | — | HTML string to search. |
| `selector` | string | ✓ | — | CSS selector to scope the search. |
| `text` | string | ✓ | — | Text to search for within the matched elements. |

```yaml
# Find all list items that mention a specific status keyword
- group: html
  name: findByText
  params:
    html: '{{ pageHtml }}'
    selector: li
    text: 'completed'
```

## Search

### `fromMarkdown`

Converts Markdown text into HTML.

**Returns:** The rendered HTML string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `markdown` | string | ✓ | — | Markdown source text to convert. |
| `sanitize` | boolean |  | true | Strip potentially unsafe HTML (scripts, event handlers) from the output. Enabled by default. |
| `inline` | boolean |  | false | Render as an inline fragment instead of a full document — skips wrapping the output in block tags like &lt;p&gt; or &lt;h1&gt;. Use for short snippets (e.g. a single line with a link) that will be inserted into existing HTML. Disabled by default. |

```yaml
# Render a markdown-authored email body as HTML
- group: html
  name: fromMarkdown
  params:
    markdown: |
      # Hello {{ name }}
      Your order **{{ order_id }}** is ready.
  output: email_body
```

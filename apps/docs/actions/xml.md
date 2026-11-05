<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# XML Actions

## General

### `parse`

Parses an XML string into a JSON object.

**Returns:** The parsed document as a plain object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `xml` | string | ✓ | — | XML string to parse. |
| `ignoreAttributes` | boolean |  | false | When true, element attributes are stripped from the result (default false). |

```yaml
# Convert a raw XML API response into a workable object
- group: xml
  name: parse
  params:
    xml: '{{ responseBody }}'
```

## Parsing

### `parseFeed`

Parses an RSS 2.0 or Atom feed into a normalized object, regardless of which
of the two formats the source feed uses.

**Returns:** An object with `title`, `link`, `description`, and an `items` array where each
  item has `title`, `link`, `description`, `pubDate`, and `guid`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `xml` | string | ✓ | — | Raw RSS or Atom feed XML content to parse. |

```yaml
# Read the latest posts from a blog's RSS feed
- group: xml
  name: parseFeed
  params:
    xml: '{{ feedResponseBody }}'
```

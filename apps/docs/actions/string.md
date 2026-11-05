<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# String Actions

## General

### `camelCase`

Converts a string to camelCase format.

**Returns:** The camelCase version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to convert to camelCase. |

```yaml
# Convert task name to camelCase — useful for generating variable identifiers
- group: string
  name: camelCase
  params:
    string: '{{ taskName }}'
```

## Casing

### `capitalize`

Capitalizes the first character of a string and lowercases the rest.

**Returns:** The capitalized string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to capitalize. |

```yaml
# Capitalize action label — useful for display in UI headings
- group: string
  name: capitalize
  params:
    string: '{{ actionLabel }}'
```

### `kebabCase`

Converts a string to kebab-case format.

**Returns:** The kebab-case version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to convert to kebab-case. |

```yaml
# Convert task name to kebab-case — useful for URL slugs and CLI flags
- group: string
  name: kebabCase
  params:
    string: '{{ taskName }}'
```

### `lowerFirst`

Lowercases the first character of a string, leaving the rest unchanged.

**Returns:** The string with its first character in lowercase.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to lowercase the first character of. |

```yaml
# Lowercase only the first character — useful when class names need camelCase normalization
- group: string
  name: lowerFirst
  params:
    string: 'SendDailyReport'
```

### `snakeCase`

Converts a string to snake_case format.

**Returns:** The snake_case version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to convert to snake_case. |

```yaml
# Convert task name to snake_case — useful for database column names or file identifiers
- group: string
  name: snakeCase
  params:
    string: '{{ taskName }}'
```

### `startCase`

Converts a string to Start Case format, capitalizing the first letter of each word.

**Returns:** The Start Case version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to convert to Start Case. |

```yaml
# Convert to Start Case — useful for rendering task names in report titles
- group: string
  name: startCase
  params:
    string: '{{ actionLabel }}'
```

### `toLowerCase`

Converts a string to lowercase.

**Returns:** The lowercase version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to lowercase. |

```yaml
# Lowercase the entire string — useful for normalizing status values before comparison
- group: string
  name: toLowerCase
  params:
    string: '{{ taskName }}'
```

### `toUpperCase`

Converts a string to uppercase.

**Returns:** The uppercase version of the input string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to uppercase. |

```yaml
# Uppercase the entire string — useful for log-level labels and status badges
- group: string
  name: toUpperCase
  params:
    string: 'running'
```

### `upperFirst`

Uppercases only the first character of a string, leaving the rest unchanged.

**Returns:** The string with its first character in uppercase.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to uppercase the first character of. |

```yaml
# Uppercase only the first character — useful for sentence-casing dynamic messages
- group: string
  name: upperFirst
  params:
    string: '{{ actionLabel }}'
```

### `endsWith`

Checks if a string ends with the specified substring.

**Returns:** `true` if the string ends with the search value, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to test. |
| `search` | string | ✓ | — | The substring to search for at the end. |
| `position` | number |  | — | Optional character position to treat as the end of the string. |

```yaml
# Check if a task name ends with a known suffix
- group: string
  name: endsWith
  params:
    string: '{{ taskName }}'
    search: 'Pipeline'
```

## Search

### `includes`

Checks if a string contains the specified substring.

**Returns:** `true` if the string contains the search value, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to search within. |
| `search` | string | ✓ | — | The substring to look for. |
| `position` | number |  | — | Optional index to start searching from. |

```yaml
# Check whether the task name contains a keyword
- group: string
  name: includes
  params:
    string: '{{ taskName }}'
    search: 'Report'
```

### `indexOf`

Returns the index of the first occurrence of a substring within a string.

**Returns:** The zero-based index of the first occurrence, or `-1` if not found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to search within. |
| `search` | string | ✓ | — | The substring to find. |
| `position` | number |  | — | Optional index to start searching from. |

```yaml
# Find the position of a keyword inside the task name
- group: string
  name: indexOf
  params:
    string: '{{ taskName }}'
    search: 'Sales'
```

### `startsWith`

Checks if a string starts with the specified substring.

**Returns:** `true` if the string starts with the target value, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to test. |
| `target` | string | ✓ | — | The substring to check for at the start. |
| `position` | number |  | — | Optional starting index to begin the check. |

```yaml
# Check if the task name begins with the expected prefix
- group: string
  name: startsWith
  params:
    string: '{{ taskName }}'
    target: 'Send'
```

### `containsRegex`

Tests whether a regular expression pattern exists within a string.

**Returns:** `true` if the pattern matches, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to test. |
| `pattern` | string | ✓ | — | Regex pattern string to test against the string. |

```yaml
# Test whether the action label contains only lowercase words
- group: string
  name: containsRegex
  params:
    string: '{{ actionLabel }}'
    pattern: "^[a-z\\s]+"
```

## Regex

### `match`

Matches a string against a regular expression, returning all matches.

**Returns:** An array of matches, or `null` if no match is found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to match against. |
| `pattern` | string \| any | ✓ | — | Regex pattern string or RegExp object. |
| `flag` | string |  | — | Optional regex flags (e.g. "g" for global, "i" for case-insensitive). |

```yaml
# Extract all capitalized words from the task name
- group: string
  name: match
  params:
    string: '{{ taskName }}'
    pattern: '[A-Z][a-z]+'
    flag: g
```

### `search`

Searches a string for a regex or substring match and returns the index of the first match.

**Returns:** The index of the first match, or `-1` if not found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to search in. |
| `pattern` | string \| any | ✓ | — | Regex pattern or string to search for. |

```yaml
# Return the index of the first digit sequence in a pipeline ID string
- group: string
  name: search
  params:
    string: 'pipeline-run-00427-completed'
    pattern: '\d+'
```

### `replace`

Replaces the first occurrence of a pattern within a string.

**Returns:** The string with the first match replaced.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to perform replacement on. |
| `pattern` | string | ✓ | — | Exact text to find (not a regex). |
| `replacement` | string |  | — | Replacement string (empty string to delete). |

```yaml
# Replace the first occurrence of a status keyword
- group: string
  name: replace
  params:
    string: 'Pipeline status: pending. Retry pending.'
    pattern: 'pending'
    replacement: 'running'
```

## Replace

### `replaceAll`

Replaces all occurrences of a pattern within a string.

**Returns:** The string with all matches replaced.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to perform replacements on. |
| `pattern` | string | ✓ | — | Exact text to find and replace everywhere (not a regex). |
| `replacement` | string |  | — | Replacement string. |

```yaml
# Replace every occurrence of a placeholder token in a template
- group: string
  name: replaceAll
  params:
    string: 'task.name, task.status, task.owner'
    pattern: 'task.'
    replacement: 'pipeline.'
```

### `slice`

Extracts a portion of a string using start and optional end indices.

**Returns:** The extracted substring.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to slice. |
| `start` | number | ✓ | — | Start index (inclusive). |
| `end` | number |  | — | End index (exclusive). Omit to slice to the end. |

```yaml
# Extract the action type from a dot-separated action identifier
- group: string
  name: slice
  params:
    string: 'string.camelCase'
    start: 7
```

## Slice & Tokenize

### `split`

Splits a string into an array of substrings using a separator.

**Returns:** An array of substrings.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to split. |
| `separator` | string | ✓ | — | Separator string to split on. |
| `limit` | number |  | — | Optional maximum number of parts to return. |

```yaml
# Split a comma-separated list of pipeline tags into an array
- group: string
  name: split
  params:
    string: 'pdf,invoice,ocr,email'
    separator: ','
```

### `substring`

Extracts a substring between the given start and end indices.

**Returns:** The extracted substring.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to extract a substring from. |
| `start` | number | ✓ | — | Start index (inclusive). |
| `end` | number | ✓ | — | End index (exclusive). |

```yaml
# Extract a substring by fixed indices — e.g., pull the group prefix from an action ID
- group: string
  name: substring
  params:
    string: 'string.camelCase'
    start: 0
    end: 6
```

### `words`

Splits a string into an array of words using an optional pattern.

**Returns:** An array of word tokens.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to split into words. |
| `pattern` | string \| any |  | — | Optional regex pattern to use as the word boundary. |

```yaml
# Tokenize a task name into individual words
- group: string
  name: words
  params:
    string: '{{ taskName }}'
```

### `trim`

Removes whitespace from both ends of a string.

**Returns:** The trimmed string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to trim whitespace from. |

```yaml
# Strip leading and trailing whitespace from user-submitted input
- group: string
  name: trim
  params:
    string: '  Send Daily Report  '
```

## Whitespace

### `trimEnd`

Removes whitespace from the end of a string.

**Returns:** The string with trailing whitespace removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to trim trailing whitespace from. |

```yaml
# Remove trailing whitespace only — e.g., after log line formatting
- group: string
  name: trimEnd
  params:
    string: 'Pipeline completed   '
```

### `trimStart`

Removes whitespace from the start of a string.

**Returns:** The string with leading whitespace removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to trim leading whitespace from. |

```yaml
# Remove leading whitespace only — e.g., after YAML indentation read
- group: string
  name: trimStart
  params:
    string: '   extract invoice data'
```

### `len`

Returns the number of characters in a string.

**Returns:** The length of the string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to measure the length of. |

```yaml
# Get the character length of a task name for validation or truncation checks
- group: string
  name: len
  params:
    string: '{{ taskName }}'
```

## Utility

### `stringify`

Converts any value to its string representation.

**Returns:** The string representation of the value.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `value` | any | ✓ | — | The value to stringify. |
| `pretty` | boolean |  | false | Whether to pretty-print JSON output. |
| `indent` | number |  | 2 | Number of spaces for indentation when pretty is true (default 2). |

```yaml
# Serialize a pipeline result object for logging or storing as a variable
- group: string
  name: stringify
  params:
    value:
      task: 'send-daily-report'
      status: 'completed'
      duration: 4821
    pretty: true
```

### `format`

Interpolates values into a template string using `{key}` placeholders.

**Returns:** The interpolated string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `template` | string | ✓ | — | Template string with {key} placeholders. |
| `values` | Record&lt;string, any&gt; | ✓ | — | Object mapping placeholder keys to their replacement values. |

```yaml
# Interpolate dynamic values into a notification message template
- group: string
  name: format
  params:
    template: 'Task "{task}" finished with status {status} in {duration}ms.'
    values:
      task: 'Send Daily Report'
      status: 'completed'
      duration: 4821
```

## Template & Encoding

### `encodeHTMLEntities`

Escapes special HTML characters in a string to their entity equivalents.

**Returns:** The HTML-encoded string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to HTML-encode (e.g. & → &amp;). |

```yaml
# Escape HTML in pipeline output before embedding it in an email body
- group: string
  name: encodeHTMLEntities
  params:
    string: '{{ htmlContent }}'
```

### `decodeHTMLEntities`

Converts HTML entities back to their original characters.

**Returns:** The decoded string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The HTML-encoded string to decode. |

```yaml
# Decode HTML entities received from an external API response
- group: string
  name: decodeHTMLEntities
  params:
    string: '{{ encodedHtml }}'
```

### `encodeURIComponent`

Percent-encodes a string for safe use as a URI component.

**Returns:** The percent-encoded URI component.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to percent-encode for use in a URI. |

```yaml
# Encode a task name for safe inclusion in a URL query parameter
- group: string
  name: encodeURIComponent
  params:
    string: '{{ taskName }}'
```

### `decodeURIComponent`

Decodes a percent-encoded URI component back to its original string.

**Returns:** The decoded string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The percent-encoded URI component to decode. |

```yaml
# Decode a percent-encoded query parameter back to its original value
- group: string
  name: decodeURIComponent
  params:
    string: 'Send%20Daily%20Report%20-%20Sales%20Pipeline'
```

### `parseQueryString`

Parses a URL query string into a key-value object.

**Returns:** A parsed object representation of the query string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | URL query string to parse (e.g. "a=1&b=2"). |

```yaml
# Parse a webhook query string into a structured object
- group: string
  name: parseQueryString
  params:
    string: 'status=running&tags[]=pdf&tags[]=invoice&limit=10'
```

## Query String

### `stringifyQueryObject`

Serializes a key-value object into a URL query string.

**Returns:** The query string representation of the object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `object` | Record&lt;string, any&gt; | ✓ | — | Object of key-value pairs to serialize as a query string. |

```yaml
# Serialize pipeline filter options into a query string for an HTTP request
- group: string
  name: stringifyQueryObject
  params:
    object:
      status: 'completed'
      tags:
        - pdf
        - invoice
      limit: 10
```

### `slugify`

Converts a string into a URL-friendly slug.

Strips accents, replaces non-alphanumeric characters with hyphens, and lowercases.

**Returns:** The slugified string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `string` | string | ✓ | — | The string to slugify (e.g. "Hello World" → "hello-world"). |

```yaml
# Generate a URL-friendly slug from a task name (strips accents and special characters)
- group: string
  name: slugify
  params:
    string: '{{ taskName }}'
```

## Slug

### `template`

Returns a multi-line string with `{{ variable }}` placeholders already resolved
by the pipeline before this action runs.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `content` | string | ✓ | — | The template string with {{ variable }} placeholders. |
| `format` | `plain` \| `html` \| `markdown` \| `css` |  | "plain" | Output content format: plain, html, markdown, or css. |

```yaml
- group: string
  name: template
  params:
    format: html
    content: |
      <h1>Hello {{ name }}</h1>
      <p>Your order {{ order_id }} is ready.</p>
  output: email_body
```

### `renderTemplate`

Renders a Liquid template kept as data — a variable, a database row, a file read
earlier — with the values in `data`. Step params only fill in `{{ }}` typed into the
step itself and leave the contents of variables alone, so a stored template needs
this step to be filled in. Loops (`{% for %}`), conditions (`{% if %}`) and filters
(`date`, `join`, `truncate`…) all work; `include`, `render` and `layout` don't.

**Returns:** The rendered text.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `template` | string | ✓ | — | The template, usually a variable holding it: '{= myTemplate =}'. Text typed here is filled in with the workflow's variables first, so pass templates in a variable. |
| `data` | Record&lt;string, any&gt; |  | {} | What the template can use, by name, e.g. { node: {= node =}, site: {= site =} }. |

```yaml
# Fill in a page template saved in the CMS with one article's values
- group: string
  name: renderTemplate
  params:
    template: '{= articleTemplate =}'
    data:
      node: '{= node =}'
      site: '{= site =}'
  destination: html
```

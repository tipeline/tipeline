<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Array Actions

## General

### `parse`

Parses a delimited string or JSON string into an array.

**Returns:** The parsed array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | The string to parse into an array. |
| `separator` | string |  | "," | Delimiter character used to split the string (default comma). |
| `type` | `json` \| `csv` \| `lines` \| `custom` |  | "json" | Parsing format: json, csv, lines, or custom separator. |
| `trim` | boolean |  | true | Whether to trim whitespace from each element. |
| `elementType` | `string` \| `number` \| `boolean` \| `auto` |  | "string" | Type to coerce each element to: string, number, boolean, or auto. |

```yaml
# Parse a comma-separated tag list from a pipeline variable
- group: array
  name: parse
  params:
    text: '{{ csvData }}'
    type: csv
    trim: true
```

## Parsing

### `toString`

Converts an array to a string using a specified format.

**Returns:** The string representation of the array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to convert to a string. |
| `separator` | string |  | "," | Delimiter to join elements with (default comma). |
| `format` | `json` \| `csv` \| `lines` |  | "csv" | Output format: json, csv, or lines. |

```yaml
# Convert a tag array to a comma-separated string for inclusion in a report header
- group: array
  name: toString
  params:
    array: '{= tags =}'
    format: csv
```

## Conversion

### `join`

Joins array elements into a single string with a separator.

**Returns:** The joined string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array whose elements to join. |
| `separator` | string |  | "," | Delimiter to place between elements (default comma). |

```yaml
# Join pipeline tags with a pipe separator for display in a dashboard label
- group: array
  name: join
  params:
    array: '{= tags =}'
    separator: ' | '
```

### `length`

Returns the number of elements in an array.

**Returns:** The number of elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to measure. |

```yaml
# Count pipeline tags for a length check before pagination
- group: array
  name: length
  params:
    array: '{= tags =}'
```

## Inspection

### `contains`

Checks if an array contains a specific value.

**Returns:** `true` if the value is found, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to search in. |
| `value` | any | ✓ | — | The value to look for in the array. |

```yaml
# Check whether the tag list includes 'pdf' before running OCR steps
- group: array
  name: contains
  params:
    array: '{= tags =}'
    value: 'pdf'
```

### `indexOf`

Finds the index of the first occurrence of a value in an array.

**Returns:** The zero-based index, or `-1` if not found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to search in. |
| `value` | any | ✓ | — | The value whose index to find. |

```yaml
# Find the position of 'ocr' in the processing stage list
- group: array
  name: indexOf
  params:
    array: '{= tags =}'
    value: 'ocr'
```

### `get`

Retrieves the element at a specific index, supporting negative indices from the end.

**Returns:** The element at the index, or `defaultValue` if out of bounds.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to access. |
| `index` | number | ✓ | — | Zero-based index of the element to retrieve (negative counts from end). |
| `defaultValue` | any |  | — | Value to return if the index is out of bounds. |

```yaml
# Get the last tag in the list using a negative index
- group: array
  name: get
  params:
    array: '{= tags =}'
    index: -1
```

### `push`

Adds an element to the start or end of an array.

**Returns:** The updated array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to add an element to. |
| `value` | any | ✓ | — | The element to add. |
| `position` | `start` \| `end` |  | "end" | Where to insert: start or end of the array. |

```yaml
# Append a new processing tag to the end of the existing tag list
- group: array
  name: push
  params:
    array: '{= tags =}'
    value: 'xml'
    position: end
```

## Modification

### `set`

Updates the element at a specific index in an array, supporting negative indices from the end.

**Returns:** The updated array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to update. |
| `index` | number | ✓ | — | Zero-based index of the element to replace (negative counts from end). |
| `value` | any | ✓ | — | The new value to set at the given index. |

```yaml
# Replace the second item in the list with a new value
- group: array
  name: set
  params:
    array: '{= items =}'
    index: 1
    value: 'updatedValue'
```

### `remove`

Removes the element at a specific index from an array.

**Returns:** The updated array with the element removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to remove an element from. |
| `index` | number | ✓ | — | Zero-based index of the element to remove. |

```yaml
# Drop the third price entry (index 2) from the scraped price list
- group: array
  name: remove
  params:
    array: '{= prices =}'
    index: 2
```

### `unique`

Removes duplicate values from an array.

**Returns:** An array with duplicate elements removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to deduplicate. |

```yaml
# Deduplicate a tag list before storing to avoid redundant entries
- group: array
  name: unique
  params:
    array: ['pdf', 'invoice', 'pdf', 'ocr', 'invoice']
```

## Filtering

### `compact`

Removes all falsy values (`null`, `undefined`, `false`, `0`, `""`, `NaN`) from an array.

**Returns:** The compacted array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to compact by removing all falsy values. |

```yaml
# Strip null and empty entries from a scraped result set before processing
- group: array
  name: compact
  params:
    array: ['pdf', null, '', false, 'invoice', 0, 'ocr']
```

### `find`

Finds the first element matching a condition.

**Returns:** The first matching element, or `null` if none match.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to search. |
| `key` | string |  | — | Property path to read from each element (e.g. "address.city"). Omit to compare the element itself. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `value` | any | ✓ | — | What to compare each element (or element property) with. An element whose value can't be read as the chosen type doesn't match. |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |

```yaml
# Find the first line item over the approval threshold
- group: array
  name: find
  params:
    array: '{= lineItems =}'
    key: amount
    compareAs: number
    operator: gt
    value: 500
```

### `filter`

Keeps only the elements that match a condition.

**Returns:** The matching elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to filter. |
| `key` | string |  | — | Property path to read from each element (e.g. "address.city"). Omit to compare the element itself. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `value` | any | ✓ | — | What to compare each element (or element property) with. An element whose value can't be read as the chosen type doesn't match. |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |

```yaml
# Keep only invoices that are still pending
- group: array
  name: filter
  params:
    array: '{= invoices =}'
    key: status
    compareAs: string
    operator: eq
    value: pending
```

### `some`

Checks if at least one element matches a condition.

**Returns:** `true` if any element matches, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to check. |
| `key` | string |  | — | Property path to read from each element (e.g. "address.city"). Omit to compare the element itself. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `value` | any | ✓ | — | What to compare each element (or element property) with. An element whose value can't be read as the chosen type doesn't match. |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |

```yaml
# Check whether any tag equals 'urgent' before escalating
- group: array
  name: some
  params:
    array: '{= tags =}'
    compareAs: string
    operator: eq
    value: urgent
```

### `every`

Checks if all elements match a condition.

**Returns:** `true` if every element matches, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to check. |
| `key` | string |  | — | Property path to read from each element (e.g. "address.city"). Omit to compare the element itself. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `value` | any | ✓ | — | What to compare each element (or element property) with. An element whose value can't be read as the chosen type doesn't match. |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |

```yaml
# Confirm every invoice line item has been paid
- group: array
  name: every
  params:
    array: '{= lineItems =}'
    key: status
    compareAs: string
    operator: eq
    value: paid
```

### `count`

Counts the elements that match a condition.

**Returns:** The number of matching elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to check. |
| `key` | string |  | — | Property path to read from each element (e.g. "address.city"). Omit to compare the element itself. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `value` | any | ✓ | — | What to compare each element (or element property) with. An element whose value can't be read as the chosen type doesn't match. |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |

```yaml
# Count how many invoices are still pending
- group: array
  name: count
  params:
    array: '{= invoices =}'
    key: status
    compareAs: string
    operator: eq
    value: pending
```

### `pluck`

Extracts a single property from each element into a new array.

**Returns:** The array of extracted values.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array of objects to pluck from. |
| `key` | string | ✓ | — | Property path to extract from each element (e.g. "address.city"). |

```yaml
# Pull just the ids out of a list of scraped records
- group: array
  name: pluck
  params:
    array: '{= records =}'
    key: id
```

## Grouping

### `groupBy`

Groups elements into buckets keyed by a property value.

**Returns:** An object mapping each key value to its matching elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array of objects to group. |
| `key` | string | ✓ | — | Property path to group by (e.g. "status"). |

```yaml
# Bucket invoices by status before generating a summary report
- group: array
  name: groupBy
  params:
    array: '{= invoices =}'
    key: status
```

### `keyBy`

Indexes elements into an object keyed by a property value (last element wins).

**Returns:** An object mapping each key value to its matching element.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array of objects to index. |
| `key` | string | ✓ | — | Property path to key by (e.g. "id"). |

```yaml
# Index a list of users by id for quick lookups
- group: array
  name: keyBy
  params:
    array: '{= users =}'
    key: id
```

### `shuffle`

Randomizes the order of elements in an array.

**Returns:** A new array with elements in random order.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to shuffle. |

```yaml
# Randomize processing order for a batch of pending tasks
- group: array
  name: shuffle
  params:
    array: '{= pendingTasks =}'
```

## Randomization

### `sample`

Picks a single random element from an array.

**Returns:** A random element, or `null` if the array is empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to sample from. |

```yaml
# Pick a random reviewer from a pool of candidates
- group: array
  name: sample
  params:
    array: '{= reviewers =}'
```

### `chunk`

Splits an array into sub-arrays of a specified size.

**Returns:** An array of chunks.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to split into chunks. |
| `size` | number | ✓ | — | Number of elements per chunk. |

```yaml
# Split a tag list into groups of 2 for batch processing
- group: array
  name: chunk
  params:
    array: '{= tags =}'
    size: 2
```

## Transformation

### `flatten`

Flattens nested arrays to the specified depth.

**Returns:** The flattened array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The nested array to flatten. |
| `depth` | number |  | 1 | Number of nesting levels to flatten (default 1). |

```yaml
# Flatten one level of nesting from a grouped result set
- group: array
  name: flatten
  params:
    array: '{= nestedData =}'
    depth: 1
```

### `intersection`

Returns elements present in every provided array.

**Returns:** An array of common elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `arrays` | any[][] | ✓ | — | Two or more arrays to intersect. |

```yaml
# Find tags shared between the current task and the reference tag list
- group: array
  name: intersection
  params:
    arrays:
      - '{= tags =}'
      - '{= extraTags =}'
```

## Set Operations

### `union`

Combines arrays and returns unique elements across all of them.

**Returns:** An array of unique elements.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `arrays` | any[][] | ✓ | — | Two or more arrays to combine into a unique set. |

```yaml
# Merge two tag lists and deduplicate the combined result
- group: array
  name: union
  params:
    arrays:
      - '{= tags =}'
      - '{= extraTags =}'
```

### `difference`

Returns elements from the first array that are not present in the second.

**Returns:** An array of elements unique to the first array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The primary array to subtract from. |
| `exclude` | any[] | ✓ | — | Array of values to exclude from the primary array. |

```yaml
# Find tags that are in the active list but not in the exclude list
- group: array
  name: difference
  params:
    array: '{= tags =}'
    exclude: '{= extraTags =}'
```

### `sort`

Sorts array elements by one or more keys and order directions.

**Returns:** The sorted array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to sort. |
| `keys` | string[] |  | — | Property keys to sort by (for arrays of objects). |
| `orders` | `asc` \| `desc`[] |  | ["asc"] | Sort direction per key: asc or desc. |

```yaml
# Sort invoice line items by size ascending for structured report output
- group: array
  name: sort
  params:
    array:
      - { name: 'invoice', size: 42 }
      - { name: 'pdf', size: 18 }
      - { name: 'ocr', size: 75 }
    keys: ['size']
    orders: ['asc']
```

## Sorting

### `reverse`

Reverses the order of elements in an array.

**Returns:** The reversed array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to reverse. |

```yaml
# Reverse a pipeline stage list to process from last to first
- group: array
  name: reverse
  params:
    array: '{= tags =}'
```

### `slice`

Extracts a contiguous portion of an array by start and optional end index.

**Returns:** The extracted sub-array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | any[] | ✓ | — | The array to slice. |
| `start` | number |  | 0 | Start index (inclusive, default 0). |
| `end` | number |  | — | End index (exclusive). Omit to slice to the end. |

```yaml
# Extract the middle two tags from a four-element tag list
- group: array
  name: slice
  params:
    array: '{= tags =}'
    start: 1
    end: 3
```

## Extraction & Combining

### `concat`

Concatenates multiple arrays into a single array.

**Returns:** The merged array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `arrays` | any[][] | ✓ | — | List of arrays to concatenate in order. |

```yaml
# Merge the main tag list with the extra tag list into one combined array
- group: array
  name: concat
  params:
    arrays:
      - '{= tags =}'
      - '{= extraTags =}'
```

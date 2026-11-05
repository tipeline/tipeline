<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Datetime Actions

## General

### `getCurrentDateTime`

Returns the current local date and time as a JavaScript `Date` object.

**Returns:** The current local `Date`.

```yaml
# Get the current local date/time — useful for timestamping pipeline runs
- group: datetime
  name: getCurrentDateTime
```

## Current Time

### `nowISO`

Returns the current UTC date and time as an ISO 8601 string.

**Returns:** The current UTC timestamp in ISO format (e.g. `2024-01-15T10:30:00.000Z`).

```yaml
# Get the current UTC timestamp — useful for storing event times in a normalized format
- group: datetime
  name: nowISO
```

### `toTimestamp`

Converts a date/time string to a Unix timestamp in milliseconds.

**Returns:** The number of milliseconds since the Unix epoch.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | Date/time string to convert (e.g. "2024-01-15T10:30:00"). |

```yaml
# Convert a pipeline timestamp to Unix ms — useful for storing in external systems
- group: datetime
  name: toTimestamp
  params:
    dateTime: '{{ pipelineStartedAt }}'
```

## Timestamp

### `fromTimestamp`

Converts a Unix timestamp (milliseconds since epoch) to an ISO date/time string.

**Returns:** The corresponding date/time as an ISO 8601 string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `timestamp` | number | ✓ | — | Unix timestamp in milliseconds to convert to a Date. |

```yaml
# Restore a date/time string from a stored Unix timestamp
- group: datetime
  name: fromTimestamp
  params:
    timestamp: 1672574400000
```

### `format`

Formats a date/time string using a date-fns pattern.

**Returns:** The formatted date string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The date/time value to format. |
| `format` | string | ✓ | — | Format pattern string (e.g. "yyyy-MM-dd", "dd/MM/yyyy HH:mm:ss"). Full token list: https://date-fns.org/docs/format |

```yaml
# Format a timestamp into a human-readable date for a report header
- group: datetime
  name: format
  params:
    dateTime: '{{ pipelineStartedAt }}'
    format: 'yyyy-MM-dd HH:mm'
```

## Format & Parse

### `parseDate`

Parses a date string into a `Date` object using a date-fns format pattern.

Uses `date-fns/parse`, which interprets the string strictly against the given format.
Throws if the string does not match the format (i.e. parses to an invalid date).

**Returns:** The parsed date/time as an ISO 8601 string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateString` | string | ✓ | — | The date string to parse. |
| `format` | string | ✓ | — | Format pattern that describes the input string (e.g. "dd/MM/yyyy"). Full token list: https://date-fns.org/docs/format |

```yaml
# Parse a date string from a CSV export into an ISO string for further processing
- group: datetime
  name: parseDate
  params:
    dateString: '{{ exportedDate }}'
    format: 'dd/MM/yyyy'
```

### `add`

Adds a duration to a date/time.

**Returns:** The resulting date/time (ISO string) after adding the duration.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The base date/time to add to. |
| `duration` | Record&lt;string, any&gt; | ✓ | — | Duration object with time unit keys and numeric values (e.g. { days: 1, hours: 2 }). |

```yaml
# Schedule a follow-up 3 days and 2 hours after the current pipeline started
- group: datetime
  name: add
  params:
    dateTime: '{{ pipelineStartedAt }}'
    duration:
      days: 3
      hours: 2
```

## Arithmetic

### `subtract`

Subtracts a duration from a date/time.

**Returns:** The resulting date/time (ISO string) after subtracting the duration.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The base date/time to subtract from. |
| `duration` | Record&lt;string, any&gt; | ✓ | — | Duration object with time unit keys and numeric values (e.g. { days: 1, hours: 2 }). |

```yaml
# Compute the start of a look-back window 7 days before the current pipeline run
- group: datetime
  name: subtract
  params:
    dateTime: '{{ pipelineStartedAt }}'
    duration:
      days: 7
```

### `startOf`

Returns the start of a day, week, month, or year for a given date/time.

Supported units: `day`, `week`, `month`, `year`.

**Returns:** The date/time (ISO string) at the start of the requested boundary.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The reference date/time. |
| `unit` | `day` \| `week` \| `month` \| `year` | ✓ | — | Boundary unit: day, week, month, or year. |

```yaml
# Get the first moment of the month containing the pipeline start
- group: datetime
  name: startOf
  params:
    dateTime: '{{ pipelineStartedAt }}'
    unit: month
```

## Boundaries

### `endOf`

Returns the end of a day, week, month, or year for a given date/time.

Supported units: `day`, `week`, `month`, `year`.

**Returns:** The date/time (ISO string) at the end of the requested boundary (last millisecond).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The reference date/time. |
| `unit` | `day` \| `week` \| `month` \| `year` | ✓ | — | Boundary unit: day, week, month, or year. |

```yaml
# Get the last moment of the month for a report date range
- group: datetime
  name: endOf
  params:
    dateTime: '{{ pipelineStartedAt }}'
    unit: month
```

### `difference`

Computes the difference between two date/times in the specified unit.

Supported units: `milliseconds`, `seconds`, `minutes`, `hours`, `days`.

**Returns:** The numeric difference in the requested unit.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `date1` | string \| date | ✓ | — | The first (earlier) date/time. |
| `date2` | string \| date | ✓ | — | The second (later) date/time. |
| `unit` | `milliseconds` \| `seconds` \| `minutes` \| `hours` \| `days` | ✓ | — | Unit for the result: milliseconds, seconds, minutes, hours, or days. |

```yaml
# Measure pipeline execution duration in seconds
- group: datetime
  name: difference
  params:
    date1: '{{ pipelineFinishedAt }}'
    date2: '{{ pipelineStartedAt }}'
    unit: seconds
```

## Difference

### `isAfter`

Checks whether a date/time is after another.

**Returns:** `true` if `dateTime` is after `dateTimeToCompare`, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The date/time to test. |
| `dateTimeToCompare` | string \| date | ✓ | — | The date/time to compare against. |

```yaml
# Guard: only proceed if the pipeline deadline has not passed
- group: datetime
  name: isAfter
  params:
    dateTime: '{{ deadline }}'
    dateTimeToCompare: '{{ pipelineStartedAt }}'
```

## Compare

### `isBefore`

Checks whether a date/time is before another.

**Returns:** `true` if `dateTime` is before `dateTimeToCompare`, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The date/time to test. |
| `dateTimeToCompare` | string \| date | ✓ | — | The date/time to compare against. |

```yaml
# Verify that the scheduled send time is still in the future
- group: datetime
  name: isBefore
  params:
    dateTime: '{{ scheduledSendAt }}'
    dateTimeToCompare: '{{ pipelineStartedAt }}'
```

### `isEqual`

Checks whether two date/times are equal.

**Returns:** `true` if both date/times represent the same instant, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The first date/time. |
| `dateTimeToCompare` | string \| date | ✓ | — | The date/time to compare for equality. |

```yaml
# Detect duplicate pipeline runs triggered at the same timestamp
- group: datetime
  name: isEqual
  params:
    dateTime: '{{ currentRunAt }}'
    dateTimeToCompare: '{{ previousRunAt }}'
```

### `isValid`

Checks whether a date/time string represents a valid date.

Returns `false` for strings like `'not-a-date'`, `'2023-13-01'` (invalid month),
or any value that does not parse to a real calendar date.

**Returns:** `true` if the string is a valid date, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dateTime` | string \| date | ✓ | — | The date/time string to validate. |

```yaml
# Validate user-supplied date input before processing
- group: datetime
  name: isValid
  params:
    dateTime: '{{ userInputDate }}'
```

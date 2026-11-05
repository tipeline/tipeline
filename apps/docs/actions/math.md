<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Math Actions

## General

### `abs`

Returns the absolute value of a number.

**Returns:** The absolute value of the input number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to take the absolute value of. |

```yaml
# Convert a negative balance to a positive magnitude
- group: math
  name: abs
  params:
    number: '{{ balance }}'
```

## Arithmetic

### `add`

Adds two numbers.

**Returns:** The sum of augend and addend.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `augend` | number | ✓ | — | The first number (augend) to add. |
| `addend` | number | ✓ | — | The second number (addend) to add. |

```yaml
# Add a fixed shipping fee to a pipeline-produced subtotal
- group: math
  name: add
  params:
    augend: '{{ subtotal }}'
    addend: 5
```

### `subtract`

Subtracts one number from another.

**Returns:** The difference of minuend minus subtrahend.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `minuend` | number | ✓ | — | The number to subtract from. |
| `subtrahend` | number | ✓ | — | The number to subtract. |

```yaml
# Subtract a discount from the invoice total
- group: math
  name: subtract
  params:
    minuend: '{{ invoiceTotal }}'
    subtrahend: '{{ discount }}'
```

### `multiply`

Multiplies two numbers.

**Returns:** The product of multiplier and multiplicand.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `multiplier` | number | ✓ | — | The first number (multiplier). |
| `multiplicand` | number | ✓ | — | The second number (multiplicand). |

```yaml
# Calculate total price from unit price and quantity
- group: math
  name: multiply
  params:
    multiplier: '{{ unitPrice }}'
    multiplicand: '{{ quantity }}'
```

### `divide`

Divides one number by another.

**Returns:** The quotient of dividend divided by divisor.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dividend` | number | ✓ | — | The number to divide (dividend). |
| `divisor` | number | ✓ | — | The number to divide by (cannot be zero). |

```yaml
# Calculate average order value from total revenue and order count
- group: math
  name: divide
  params:
    dividend: '{{ totalRevenue }}'
    divisor: '{{ orderCount }}'
```

### `mod`

Returns the remainder after dividing two numbers.

**Returns:** The remainder after dividing dividend by divisor.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dividend` | number | ✓ | — | The number to divide (dividend). |
| `divisor` | number | ✓ | — | The divisor (cannot be zero). |

```yaml
# Check if a row index is even to apply alternating row formatting
- group: math
  name: mod
  params:
    dividend: '{{ rowIndex }}'
    divisor: 2
```

### `pow`

Raises a base number to an exponent.

**Returns:** The result of base raised to exponent.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `base` | number | ✓ | — | The base number. |
| `exponent` | number | ✓ | — | The exponent to raise the base to. |

```yaml
# Calculate exponential backoff — 2 to the power of the retry count
- group: math
  name: pow
  params:
    base: 2
    exponent: '{{ retryCount }}'
```

### `ceil`

Rounds a number up to the nearest integer.

**Returns:** The smallest integer greater than or equal to the input number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to round up. |

```yaml
# Round up page count so all records fit — e.g., 7.33 pages → 8 pages
- group: math
  name: ceil
  params:
    number: '{{ pageCount }}'
```

## Rounding

### `floor`

Rounds a number down to the nearest integer.

**Returns:** The largest integer less than or equal to the input number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to round down. |

```yaml
# Floor a float confidence score to its integer part for bucketing
- group: math
  name: floor
  params:
    number: '{{ confidenceScore }}'
```

### `round`

Rounds a number to the nearest integer.

**Returns:** The nearest integer to the input number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to round. |

```yaml
# Round a computed average to a whole number before displaying it
- group: math
  name: round
  params:
    number: '{{ averageScore }}'
```

### `trunc`

Truncates a number toward zero, removing the fractional part.

**Returns:** The integer part of the number, truncated toward zero.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to truncate. |

```yaml
# Truncate a negative offset toward zero — e.g., -7.9 → -7
- group: math
  name: trunc
  params:
    number: '{{ rawOffset }}'
```

### `toFixed`

Formats a number to a fixed number of decimal places.

**Returns:** A string representation of the number fixed to the specified decimal places.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to format. |
| `digits` | number | ✓ | — | Number of decimal places to keep (0–20). |

```yaml
# Format a calculated price to two decimal places for an invoice line item
- group: math
  name: toFixed
  params:
    number: '{{ lineItemTotal }}'
    digits: 2
```

### `formatNumber`

Formats a number using locale-aware grouping and decimal separators.

**Returns:** A locale-formatted string representation of the number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to format. |
| `locale` | string |  | — | BCP 47 locale string (e.g. "en-US", "de-DE"). Defaults to system locale. |
| `minimumFractionDigits` | number |  | — | Minimum number of decimal digits to display. |
| `maximumFractionDigits` | number |  | — | Maximum number of decimal digits to display. |

```yaml
# Format total revenue for display in a report — e.g., 15000 → "15,000.00"
- group: math
  name: formatNumber
  params:
    number: '{{ totalRevenue }}'
    locale: en-US
    minimumFractionDigits: 2
    maximumFractionDigits: 2
```

### `max`

Returns the maximum value from an array of numbers.

**Returns:** The largest number in the input array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | number[] | ✓ | — | Array of numbers to find the maximum of. |

```yaml
# Find the highest price from a list of scraped product prices
- group: math
  name: max
  params:
    array: '{{ prices }}'
```

## Aggregates

### `mean`

Returns the arithmetic mean of an array of numbers.

**Returns:** The arithmetic mean of all numbers in the array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | number[] | ✓ | — | Array of numbers to average. |

```yaml
# Compute the average response time across a set of HTTP checks
- group: math
  name: mean
  params:
    array: '{{ responseTimes }}'
```

### `min`

Returns the minimum value from an array of numbers.

**Returns:** The smallest number in the input array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | number[] | ✓ | — | Array of numbers to find the minimum of. |

```yaml
# Find the lowest bid from a set of submitted prices
- group: math
  name: min
  params:
    array: '{{ bids }}'
```

### `sum`

Returns the sum of all numbers in an array.

**Returns:** The sum of all numbers in the input array.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | number[] | ✓ | — | Array of numbers to sum. |

```yaml
# Sum all invoice line item amounts to compute the subtotal
- group: math
  name: sum
  params:
    array: '{{ lineItems }}'
```

### `median`

Returns the median value of an array of numbers.

**Returns:** The middle value of the sorted array, or the mean of the two middle values for even-length arrays.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `array` | number[] | ✓ | — | Array of numbers to find the median of. |

```yaml
# Find the median score from a set of test results — more robust than mean when outliers exist
- group: math
  name: median
  params:
    array: '{= scores =}'
```

### `clamp`

Constrains a number within a minimum and maximum range.

**Returns:** The value constrained between min and max.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `value` | number | ✓ | — | The number to clamp. |
| `min` | number | ✓ | — | Lower bound (inclusive). |
| `max` | number | ✓ | — | Upper bound (inclusive). |

```yaml
# Ensure a retry delay never drops below 1s or exceeds 60s
- group: math
  name: clamp
  params:
    value: '{{ retryDelay }}'
    min: 1
    max: 60
```

## Utility

### `percentage`

Calculates what percentage a value is of a total.

**Returns:** The percentage that value represents of total, in the range 0–100.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `value` | number | ✓ | — | The partial value. |
| `total` | number | ✓ | — | The total value (cannot be zero). |

```yaml
# Calculate completion percentage from processed and total record counts
- group: math
  name: percentage
  params:
    value: '{{ processedCount }}'
    total: '{{ totalCount }}'
```

### `sign`

Returns the sign of a number as -1, 0, or 1.

**Returns:** -1 if the number is negative, 0 if zero, or 1 if positive.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number whose sign to determine. |

```yaml
# Detect whether a profit delta is positive, negative, or zero
- group: math
  name: sign
  params:
    number: '{{ profitDelta }}'
```

### `increment`

Increases a number by a step value.

**Returns:** The number increased by step (default 1).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to increment. |
| `step` | number |  | — | Amount to increment by (default 1). |

```yaml
# Advance a page counter to fetch the next batch of records
- group: math
  name: increment
  params:
    number: '{{ pageNumber }}'
```

### `decrement`

Decreases a number by a step value.

**Returns:** The number decreased by step (default 1).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `number` | number | ✓ | — | The number to decrement. |
| `step` | number |  | — | Amount to decrement by (default 1). |

```yaml
# Count down remaining retries after each failed attempt
- group: math
  name: decrement
  params:
    number: '{{ remainingRetries }}'
```

### `inRange`

Checks whether a value falls within an inclusive range.

**Returns:** True if min ≤ value ≤ max, false otherwise.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `value` | number | ✓ | — | The number to test. |
| `min` | number | ✓ | — | Lower bound (inclusive). |
| `max` | number | ✓ | — | Upper bound (inclusive). |

```yaml
# Check if an HTTP status code falls in the success range (200–299)
- group: math
  name: inRange
  params:
    value: '{{ httpStatusCode }}'
    min: 200
    max: 299
```

### `random`

Generates a random floating-point number within an optional range.

**Returns:** A random floating-point number in the range [min, max).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `min` | number |  | — | Minimum value (inclusive). Defaults to 0. |
| `max` | number |  | — | Maximum value (exclusive). Defaults to 1. |

```yaml
# Add random jitter to a retry delay to avoid thundering herd
- group: math
  name: random
  params:
    min: 500
    max: 1500
```

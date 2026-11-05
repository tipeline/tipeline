<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Flow Actions

## General

### `ifConditional`

Runs the if-branch when the condition is met.

**Returns:** true if the condition matched and the branch ran, false otherwise.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `firstOperand` | any | ✓ | — | The value to check. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `secondOperand` | any |  | — | What to compare with (not used by operators like "is empty" or "is true"). |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |
| `actions` | any[] |  | — | — |

```yaml
# Run a branch when a value equals a string
- group: flow
  name: ifConditional
  params:
    firstOperand: '{{ status }}'
    compareAs: string
    operator: eq
    secondOperand: active
    actions:
      - group: system
        name: message
        params:
          text: Status is active
```

## Conditionals

### `elseIfConditional`

Evaluates an additional condition only when no prior branch has fired.
Propagates the "branch taken" flag so downstream else/else-if actions skip correctly.

**Returns:** true if any branch has now fired (prior or this one), false if none have.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `firstOperand` | any | ✓ | — | The value to check. |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `secondOperand` | any |  | — | What to compare with (not used by operators like "is empty" or "is true"). |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |
| `actions` | any[] |  | — | — |

```yaml
# Chain after ifConditional — runs only when the if-branch did not match
- group: flow
  name: elseIfConditional
  params:
    firstOperand: '{{ status }}'
    compareAs: string
    operator: eq
    secondOperand: pending
    actions:
      - group: system
        name: message
        params:
          text: Status is pending
```

### `elseConditional`

Runs the else-branch only when no prior branch has fired.

**Returns:** true always — the chain is resolved either way.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `actions` | any[] |  | — | — |

```yaml
# Fallback when no if/else-if condition matched
- group: flow
  name: elseConditional
  params:
    actions:
      - group: system
        name: message
        params:
          text: No condition matched
```

### `switchConditional`

Declares the expression that subsequent caseConditional actions will match against.
Must be immediately followed by one or more caseConditional actions, and optionally
a defaultConditional. Returns a SwitchState object that caseConditional reads via
lastResult — the same propagation pattern used by if/elseIf/else.

**Returns:** A SwitchState object carrying the resolved expression.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `expression` | string | ✓ | — | The value or expression to match against case blocks. |

```yaml
- group: flow
  name: switchConditional
  params:
    expression: '{{ fruit }}'
- group: flow
  name: caseConditional
  params:
    match: banana
    actions:
      - group: system
        name: message
        params:
          text: it is a banana
- group: flow
  name: defaultConditional
  params:
    actions:
      - group: system
        name: message
        params:
          text: unknown fruit
```

### `caseConditional`

Runs the branch when the switch expression equals the match value and no prior
case has already fired. Propagates the SwitchState so subsequent cases and the
defaultConditional know whether to skip.

**Returns:** The updated SwitchState (matched=true if this case ran, unchanged otherwise).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `match` | string | ✓ | — | The value this case matches against the switch expression. |
| `actions` | any[] |  | — | — |

```yaml
- group: flow
  name: caseConditional
  params:
    match: banana
    actions:
      - group: system
        name: message
        params:
          text: banana case ran
```

### `defaultConditional`

Runs the fallback branch when no caseConditional matched.

**Returns:** true always — the switch chain is resolved.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `actions` | any[] |  | — | — |

```yaml
- group: flow
  name: defaultConditional
  params:
    actions:
      - group: system
        name: message
        params:
          text: no case matched
```

### `simpleLoop`

Runs the body a fixed number of times, stepping from indexValue up to (but not
including) indexEndValue by incrementBy.

**Returns:** true when the loop completes.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `indexValue` | number | ✓ | — | Starting index value (inclusive). |
| `indexEndValue` | number | ✓ | — | Ending index value (exclusive). |
| `incrementBy` | number | ✓ | — | Amount to increment the index on each iteration. |
| `indexVariable` | string |  | — | Optional existing number variable to hold the current loop index on each iteration. |
| `actions` | any[] |  | — | — |

```yaml
# Repeat 5 times (iterations 0 → 4)
- group: flow
  name: simpleLoop
  params:
    indexValue: 0
    indexEndValue: 5
    incrementBy: 1
    actions:
      - group: system
        name: message
        params:
          text: Loop iteration
```

## Loops

### `forEachLoop`

Iterates over an array, binding each element to a task variable before running the body.

**Returns:** true when the loop completes.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `iterable` | string \| any[] | ✓ | — | The array or string variable to iterate over. |
| `currentItem` | string | ✓ | — | Variable name to bind the current element on each iteration. |
| `indexVariable` | string |  | — | Optional existing number variable to hold the current position (starting at 0) on each iteration. |
| `actions` | any[] |  | — | — |

```yaml
# Walk an array and process each item
- group: flow
  name: forEachLoop
  params:
    iterable: '{= myArray =}'
    currentItem: item
    actions:
      - group: system
        name: message
        params:
          text: '{{ item }}'
```

### `conditionalLoop`

Runs the body repeatedly while the condition remains true, re-evaluating against
live variable values on every iteration.

The condition operands are resolved from rawParams on each pass so that mutations
made to variables inside the loop body are reflected in the next check.
Throws after 10 000 iterations as a runaway-loop safety guard.

**Returns:** true when the condition becomes false and the loop exits.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `firstOperand` | any | ✓ | — | The value to check on each iteration (the loop runs while the condition is true). |
| `compareAs` | `string` \| `number` \| `date` \| `boolean` \| `array` \| `object` | ✓ | — | How both values are read before comparing: text, number, date, boolean, array or object. |
| `operator` | `eq` \| `neq` \| `contains` \| `notContains` \| `startsWith` \| `notStartsWith` \| `endsWith` \| `notEndsWith` \| `matchesRegex` \| `notMatchesRegex` \| `lengthEq` \| `lengthNeq` \| `lengthGt` \| `lengthGte` \| `lengthLt` \| `lengthLte` \| `exists` \| `notExists` \| `empty` \| `notEmpty` \| `isValid` \| `gt` \| `gte` \| `lt` \| `lte` \| `after` \| `afterOrEqual` \| `before` \| `beforeOrEqual` \| `isTrue` \| `isFalse` \| `hasKey` \| `notHasKey` | ✓ | — | The comparison to make. The list depends on "Compare as". |
| `secondOperand` | any |  | — | What to compare with (not used by operators like "is empty" or "is true"). |
| `ignoreCase` | boolean |  | — | Text comparisons treat upper and lower case as the same. |
| `indexVariable` | string |  | — | Optional existing number variable to hold the current iteration count (starting at 0). |
| `actions` | any[] |  | — | — |

```yaml
# Increment counter until it reaches 5
- group: flow
  name: conditionalLoop
  params:
    firstOperand: '{= counter =}'
    compareAs: number
    operator: lt
    secondOperand: 5
    actions:
      - group: math
        name: add
        params:
          augend: '{= counter =}'
          addend: 1
        destination: counter
```

### `wait`

Pauses execution for the specified duration.

**Returns:** true after the pause completes.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `timeout` | number |  | — | Duration to wait in milliseconds. |

```yaml
# Wait 2 seconds before continuing
- group: flow
  name: wait
  params:
    timeout: 2000
```

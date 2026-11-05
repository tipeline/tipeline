# Conditions

A condition checks one value and answers true or false. The **If**, **ElseIf** and **Conditional Loop** steps run their branch when it's true; the array steps **find**, **filter**, **some**, **every** and **count** check it on each element; and an app's table and progress **color rules** use it to pick a color.

Every condition has the same parts:

```yaml
- group: flow
  name: ifConditional
  params:
    firstOperand: "{{ order.total }}"   # the value to check
    compareAs: number                   # how to read the values
    operator: gt                        # the comparison
    secondOperand: 1000                 # what to compare with
    actions:
      - group: system
        name: message
        params:
          text: Big order
```

| Field | What it is |
|---|---|
| `firstOperand` | The value to check. Usually a variable: `{{ status }}` or `{= items =}`. |
| `compareAs` | How both values are read: `string`, `number`, `date`, `boolean`, `array` or `object`. Required. |
| `operator` | The comparison. Which ones you can use depends on `compareAs` (see below). |
| `secondOperand` | What to compare with. Not used by operators like `empty` or `isTrue`. |
| `ignoreCase` | Optional, `true` to treat upper and lower case as the same in text comparisons. |

In the builder you pick **Compare as** first; the **Operator** list then shows only that type's operators, and **Compare with** disappears for operators that don't use it.

## Try it

A self-checking workflow in the repository tries a few cases of each type. Each check prints ✅ or ❌ and the last step says whether all of them passed:

- **`examples/actions/flow/conditions.yml`** — text, numbers, dates, booleans, arrays and objects, plus the array steps and a Conditional Loop. At the end, two commented-out steps show the messages you get for values that can't be compared.

## Why the type matters

A value is converted to the chosen type **before** it's compared, and both sides are converted the same way. This is what makes text from templates compare correctly:

- `{{ }}` always produces **text**. `{{ count }}` gives `"10"`, not `10`, and compared as text `"10"` is *smaller* than `"9"` (it compares letter by letter). With `compareAs: number`, both become numbers and `10 > 9` is true.
- `{= =}` passes the **value itself** — a list stays a list, an object stays an object. Use it for `array` and `object` conditions: `{{ fruits }}` would turn the list into text (`applebananacherry`).

If a value can't be read as the chosen type, the step **fails with a message** saying which value and why, instead of quietly going to the else branch:

```
The value is "Banana", not a number (compared as number).
```

```
The value is "applebananacherry", not an array (compared as array).
Use {= name =} instead of {{ name }} to pass the value itself, not its text.
```

To check first whether a value can be read as a type, use `isValid` (below).

## Operators by type

### Text — `compareAs: string`

Numbers and true/false are read as their text (`42` → `"42"`). Lists and objects aren't text and fail.

| Operator | True when the value… | Example `secondOperand` |
|---|---|---|
| `eq` | equals the text | `active` |
| `neq` | doesn't equal the text | `active` |
| `contains` | contains the text | `@acme.com` |
| `notContains` | doesn't contain the text | `test` |
| `startsWith` | starts with the text | `INV-` |
| `notStartsWith` | doesn't start with the text | `tmp_` |
| `endsWith` | ends with the text | `.pdf` |
| `notEndsWith` | doesn't end with the text | `.tmp` |
| `matchesRegex` | matches the regular expression | `^INV-\d{4}$` |
| `notMatchesRegex` | doesn't match the regular expression | `^\s*$` |
| `lengthEq` | has exactly this many characters | `6` |
| `lengthNeq` | doesn't have this many characters | `6` |
| `lengthGt` / `lengthGte` | has more than / at least this many characters | `3` |
| `lengthLt` / `lengthLte` | has fewer than / at most this many characters | `255` |

Comparisons are case-sensitive: `Banana` doesn't equal `banana`. Add `ignoreCase: true` to make them equal — it applies to `eq`, `neq`, the `contains`, `startsWith` and `endsWith` families, and the regex operators.

```yaml
firstOperand: "{{ status }}"
compareAs: string
operator: eq
secondOperand: inactive
ignoreCase: true          # "Inactive" and "INACTIVE" match too
```

### Number — `compareAs: number`

Text that is a number is read as one (`"1250"`, `" 42 "`, `"42.0"`). Empty text and anything else (`"n/a"`) fail.

| Operator | True when the value is… |
|---|---|
| `eq` | equal to the number (`"42"` equals `42.0`) |
| `neq` | not equal to the number |
| `gt` | greater than the number |
| `gte` | greater than or equal to the number |
| `lt` | less than the number |
| `lte` | less than or equal to the number |

```yaml
firstOperand: "{{ order.total }}"
compareAs: number
operator: gte
secondOperand: 1000
```

### Date & time — `compareAs: date`

Reads ISO text like `2026-10-01` or `2026-10-01T14:30:00Z`, dates, and timestamps in milliseconds. A date without a time is **midnight in your time zone**, the same as a date you type.

| Operator | True when the value is… |
|---|---|
| `eq` | the same moment |
| `neq` | a different moment |
| `after` | later than the date |
| `afterOrEqual` | the same or later |
| `before` | earlier than the date |
| `beforeOrEqual` | the same or earlier |

```yaml
firstOperand: "{{ invoice.dueDate }}"
compareAs: date
operator: before
secondOperand: "2026-12-31"
```

### Boolean — `compareAs: boolean`

Reads `true` / `false`, and also `"true"`, `"yes"`, `"on"`, `"1"`, `1` as true and `"false"`, `"no"`, `"off"`, `"0"`, `0` as false (any case). Anything else fails.

| Operator | True when the value… | Needs `secondOperand` |
|---|---|---|
| `isTrue` | is true | no |
| `isFalse` | is false | no |
| `eq` | equals `true` / `false` | yes |
| `neq` | doesn't equal `true` / `false` | yes |

```yaml
firstOperand: "{{ decision.approved }}"
compareAs: boolean
operator: isTrue
```

### Array — `compareAs: array`

The value must be a list — pass it with `{= list =}`.

| Operator | True when the list… | Example `secondOperand` |
|---|---|---|
| `contains` | has the item | `admin` |
| `notContains` | doesn't have the item | `admin` |
| `lengthEq` | has exactly this many items | `3` |
| `lengthNeq` | doesn't have this many items | `0` |
| `lengthGt` / `lengthGte` | has more than / at least this many items | `10` |
| `lengthLt` / `lengthLte` | has fewer than / at most this many items | `100` |

How `contains` matches an item:

- Objects match **by content**: `[{ id: 3 }]` contains `{ id: 3 }`.
- A number matches its text, so `[1, 2, 3]` contains `"2"` typed in the builder.
- `ignoreCase: true` makes text items match in any case (`["Admin"]` contains `admin`).

```yaml
firstOperand: "{= user.roles =}"
compareAs: array
operator: contains
secondOperand: admin
```

### Object — `compareAs: object`

The value must be an object (not a list) — pass it with `{= object =}`.

| Operator | True when the object… | Example `secondOperand` |
|---|---|---|
| `hasKey` | has the property | `email` |
| `notHasKey` | doesn't have the property | `deletedAt` |

```yaml
firstOperand: "{= customer =}"
compareAs: object
operator: hasKey
secondOperand: email
```

### Every type

These work with any `compareAs` and take no `secondOperand`. Only `isValid` depends on the type; the others look at the value as it is.

| Operator | True when the value… |
|---|---|
| `exists` | is set (not null or missing) |
| `notExists` | is null or missing |
| `empty` | is null, missing, empty text `""`, an empty list `[]` or an empty object `{}` |
| `notEmpty` | isn't empty. Numbers, true/false and dates are never empty. |
| `isValid` | can be read as `compareAs` — e.g. `"1250"` is a valid number, `"Banana"` isn't; `"2026-10-01"` is a valid date |

```yaml
# Only parse the date if the form field really holds one
firstOperand: "{{ form.birthday }}"
compareAs: date
operator: isValid
```

::: tip Checking for a missing property
To check whether an object has a property, use `compareAs: object` with `hasKey` / `notHasKey` on the object. A reference to a missing property, like `{= customer.phone =}`, gives back its own text instead of nothing, so `notExists` can't detect it.
:::

## Conditional Loop

A Conditional Loop runs its steps **while** the condition is true, checking it again before each pass with the variables' current values:

```yaml
- group: flow
  name: conditionalLoop
  params:
    firstOperand: "{{ counter }}"
    compareAs: number
    operator: lt
    secondOperand: 5
    actions:
      - group: math
        name: add
        params:
          augend: "{= counter =}"
          addend: 1
        destination: counter
```

It stops after 10,000 passes as a safety guard.

## Array steps

`find`, `filter`, `some`, `every` and `count` check a condition on each element of a list. They use the same `compareAs`, `operator` and `ignoreCase`, with `key` for the property to read and `value` for what to compare with:

```yaml
- group: array
  name: filter
  params:
    array: "{= invoices =}"
    key: amount              # each element's amount (dots reach nested properties)
    compareAs: number
    operator: gt
    value: 100
  destination: bigInvoices
```

Leave out `key` to compare each element itself. One difference from If: an **element** whose value can't be read as the type (an amount of `"n/a"`, a missing date) simply doesn't match — the step doesn't fail. A `value` that can't be read (comparing as a number with `"lots"`) still fails the step, since that's a mistake in the workflow.

## App color rules

A table column's `highlight` and a progress bar's or KPI card's `colorRules` are conditions too, plus a badge `color`. The first rule that matches colors the cell:

```yaml
- key: amount
  format: currency
  highlight:
    - { compareAs: number, operator: lt, value: 0, color: red }
    - { compareAs: number, operator: gte, value: 5000, color: green }
- key: status
  highlight:
    - { compareAs: string, operator: eq, value: overdue, ignoreCase: true, color: red }
```

A cell that can't be read as `compareAs` (`n/a` in a number column) just doesn't match. See [Table columns](/apps/#table-columns-links-images-colors-and-filters).

## Not a condition: Switch

**Switch** / **Case** don't use conditions: each Case runs when the Switch value is exactly equal to its `match`. Use If / ElseIf for anything else.

<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Variable Actions

## General

### `set`

Sets the value of an existing pipeline variable by name.

**Returns:** `true` when the variable is updated, `undefined` if not found.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `name` | string | ✓ | — | Variable name (letters, numbers, underscores; prefix with "_global." for global scope). |
| `value` | any | ✓ | — | Value to assign to the variable. |

```yaml
# Overwrite a task variable mid-pipeline — useful for tracking loop state or computed values
- group: variable
  name: set
  params:
    name: greeting
    value: Hello Tipeline
```

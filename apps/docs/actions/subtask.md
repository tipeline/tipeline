<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Subtask Actions

## General

### `exec`

Runs a child task inline and waits for it to finish before the parent continues.

Provide either `identifier` (a task stored in the database) or `path` (a YAML/JSON file path).
Use `props` to inject parent variable values into the child's named variables before it runs.
Use `outputs` to pull named child variables back into the parent pipeline after it finishes.
Database-backed tasks (`identifier`) always persist a full pipeline record; file-based tasks
(`path`) never persist.

Set `async: true` to start the child and return immediately instead of waiting — the parent's
next action runs right away while the child keeps executing in the background. `outputs` is
rejected in this mode (there is no result yet to read back), and the child's progress does not
stream live to the parent's run; it only shows up afterwards in pipeline history.

**Returns:** `true` when the subtask completes successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `identifier` | string |  | — | Identifier of the child task to execute. |
| `path` | string |  | — | File path to the child task definition (alternative to identifier). |
| `props` | Record&lt;string, any&gt; |  | — | Key-value pairs passed as input variables to the child task. |
| `outputs` | Record&lt;string, any&gt; |  | — | Mapping of child task output variable names to local variable names. |
| `async` | boolean |  | — | Run the child task in the background without waiting for it to finish. The parent continues immediately. Cannot be combined with outputs, since the child has not produced a result yet when the parent moves on. |

```yaml
# Run a named subtask, inject a prop, map child outputs to parent variables
- group: subtask
  name: exec
  params:
    identifier: generate-pdf-report
    props:
      invoiceId: '{{ currentInvoiceId }}'
    outputs:
      parentReportPath: reportPath   # parent ← child
```

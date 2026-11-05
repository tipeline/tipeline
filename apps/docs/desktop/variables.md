# Variables

The **Variables** section (`/variables`) in the Desktop app manages **global variables** — persistent values shared across all workflows.

## Global Variables Table

The variables list shows all global variables with their name, type, and value (masked if sensitive).

| Column | Description |
|--------|-------------|
| Name | Template identifier — use as `{{ _global.name }}` |
| Type | Value type |
| Value | Current value (hidden if `secret = true`) |
| Readonly | Can't be overwritten by workflows |

## Creating a Variable

Click **New Variable** to open the creation dialog:

1. **Name** — identifier (lowercase, no spaces recommended)
2. **Type** — string, number, boolean, date, array, object, workbook, oauthToken, audio or video (live handles like a browser or a connection can't be global)
3. **Value** — initial value (JSON for array/object)
4. **Sensitive** — masks the value in UI and logs
5. **Readonly** — prevents workflows from overwriting it

> Live handle types (`browser`, `sshConnection`, `dbConnection`, `image`)
> aren't offered here — they hold an in-memory connection/process handle
> that can't survive as durable global state. They're only usable as
> workflow-scoped variables. See
> [Variable System — Unsupported Global Types](/internals/variable-system#unsupported-global-types).

## Using Global Variables in Workflows

Reference global variables in any action parameter:

```yaml
# Template syntax (produces a string)
params:
  url: "{{ _global.apiBaseUrl }}/users"

# Raw injection (preserves type)
params:
  config: "{= _global.defaultConfig =}"
```

Global variables are lazy-loaded — only fetched from the database when a parameter actually references `_global.*`.

A step that reads a global variable that doesn't exist fails, and the error names it. To make one
optional, give it a default (`{{ _global.region | default: 'eu' }}`), or test it with
`{% if _global.region %}`. A step with `onError: continue` reads a missing one as empty.

> Workflow variables (defined in a workflow's own `variables:` section, not here)
> have a separate `public` / `protected` / `private` visibility used to hide
> a variable from the workflow overview form and/or gate whether a parent workflow
> can read or write it when this workflow runs as a sub-workflow. See
> [Variable System — Visibility](/internals/variable-system#visibility).

## Managing via CLI

```bash
# List all global variables
tipeline variable list

# Create a new variable
tipeline variable create --name apiToken --type string --value "abc123" --sensitive

# Edit a variable
tipeline variable edit <identifier> --value "newValue"

# Delete a variable
tipeline variable delete <identifier>
```

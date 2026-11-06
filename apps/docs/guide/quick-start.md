# Quick Start

This guide walks through creating and running your first Tipeline workflow from the terminal, in under five minutes.

::: tip Using the Desktop app?
You don't need the terminal: open **Workflows → New Workflow**, add the same steps in the
builder and click **Run**. See [Workflow Builder](/desktop/builder). The Desktop app starts
Core for you.
:::

## 1. Start the Core Engine

```bash
tipeline install   # first time only
tipeline start
```

`tipeline install` creates the `~/.tipeline` folders and configuration. Core then starts its IPC socket, its WebSocket server (port 4000) and its MCP server (port 4002). It keeps running in the background — you can close the terminal and it will continue.

## 2. Write a Workflow File

Create a file `my-first-workflow.yaml`:

```yaml
name: My First Workflow
description: Opens a web page and prints its title.

pipeline:
  variables:
    - name: url
      type: string
      label: URL
      value: "https://example.com"
      visibility: public
    - name: browser
      type: browser
    - name: pageTitle
      type: string

  actions:
    - group: browser
      name: launch
      params:
        headless: true
      destination: browser

    - group: browser
      name: goTo
      params:
        browser: "{= browser =}"
        url: "{{ url }}"

    - group: browser
      name: getPageTitle
      params:
        browser: "{= browser =}"
      destination: pageTitle

    - group: system
      name: message
      params:
        text: "Page title: {{ pageTitle }}"

    - group: browser
      name: close
      params:
        browser: "{= browser =}"
```

Every workflow has a `name`, a `description` and a `pipeline` with its `variables` and
`actions`. Declare every variable a step stores its result in, like `browser` and `pageTitle` here. See [Workflow Files](/workflows/files) for every field.

## 3. Run the Workflow

```bash
tipeline workflow run my-first-workflow.yaml
```

Each step's result streams to the terminal as it finishes, and the run ends with the page title printed by the `system.message` step. Add `-v` to see every step's parameters and result.

## 4. Install the Workflow

To save the workflow to the database for repeated use:

```bash
tipeline workflow install my-first-workflow.yaml
tipeline workflow list
```

Then run it by identifier:

```bash
tipeline workflow exec <identifier>
```

## 5. Override Variables at Runtime

Pass variable overrides on the command line:

```bash
tipeline workflow run my-first-workflow.yaml --var url=https://github.com
```

## Variable Syntax

| Syntax | When to use |
|--------|-------------|
| `{{ varName }}` | String interpolation (LiquidJS template) |
| `{= varName =}` | Raw injection — keeps the original type (object, array, browser handle, …) |
| `{{ _env.KEY }}` | A value from a `.env` file next to the workflow, `~/.tipeline/.env`, or the environment |
| `{{ _global.name }}` | A global variable |
| `{{ _previous }}` | The previous step's result |

See [Variables & Templates](/workflows/variables) for the details.

## Error Handling

Each action supports an `onError` field:

```yaml
- group: http
  name: request
  params:
    url: "{{ apiUrl }}"
  onError: continue   # 'throw' (default) | 'continue'
  destination: response
```

- `throw` — stops the run immediately and marks it failed (default)
- `continue` — ignores the error and goes on to the next step; the step's result is empty

## Next Steps

- [Workflow Files](/workflows/files) — full workflow file schema and examples
- [Actions Reference](/actions/) — browse all 30+ action categories
- [CLI Reference](/cli/commands) — all available CLI commands
- [Desktop App](/desktop/overview) — build workflows visually

# Workflow Files (YAML)

A workflow file is the universal format for defining Tipeline automations — plain YAML (or JSON) that declares variables and a sequence of actions. Workflow files work the same whether you run them from the CLI, load them into the Desktop app, or install them for scheduled execution.

## Full Schema

```yaml
name: string                    # required — display name
description: string             # required — Markdown (see below)
author: string                  # optional
version: 1.0.0                  # optional — semver x.y.z (see Versioning)
platform: macos                 # optional — windows | linux | macos; leave out for "runs anywhere"
tags: [string]                  # optional — lowercase letters, numbers, spaces, hyphens (other characters removed); shown in lists, search, assistant
cache:                          # optional — reuse outputs (see Caching Results)
  ttl: 5m                       # how long: seconds, or 30s / 15m / 1h / 1d
  inputs: [string]              # optional — the inputs that decide "the same call"
helper: true                    # optional — only other workflows run it; the assistant never offers it (see Helper workflows)

pipeline:                       # required
  variables:                    # optional
    - name: string              # letters, digits and _; can't start with _
      type: string              # see Variable types below
      label: string             # optional — shown on run forms instead of the name
      description: string       # optional — shown on run forms; the assistant reads it too
      value: any                # default value
      required: boolean         # must have a value when the run starts
      visibility: private       # public | protected | private (default) — see below
      output: boolean           # filled in by the workflow and returned, never asked for — see Outputs
      secret: boolean           # masked in logs, run details and the UI
      readonly: boolean         # actions can't change it
      valueFromEnv: KEY         # optional — default from an environment variable
      valueFromEnvFile: path    # optional — the .env file to read valueFromEnv from
      valueFromGlobal: name     # optional — default from a global variable

  actions:                      # required
    - group: string             # action category (e.g. browser, string)
      name: string              # specific action (e.g. goTo, replace)
      params:                   # action-specific parameters (see each action's docs)
        key: value
      destination: string       # optional — variable to store the result in (_global.name for a global)
      onError: throw            # throw (default) | continue
      disabled: boolean         # skip this action if true
      cache:                    # optional — reuse the result (see Caching Results)
        ttl: 1h
        key: [string]           # optional — the params that decide "the same call"
```

See [Caching Results](./caching) for which steps and workflows can be cached, and
[Variables & Templates](./variables) for how values are referenced.

### Variable types

`string`, `number`, `boolean`, `date`, `array`, `object` hold plain values.
`browser`, `sshConnection`, `dbConnection`, `workbook`, `image`, `audio` and `video` hold live
handles an earlier step created (a browser session, a connection, a loaded file); pass
them on with `{= name =}`.

### Visibility

Visibility decides what callers outside the workflow can see. Apps, parent workflows, the
assistant and MCP clients are all callers; the workflow overview is the person's own run form:

| Visibility | Callers (apps, parent workflows, assistant, MCP clients) | Workflow overview |
|---|---|---|
| `public` | Can set it and read it | Shown as an input |
| `protected` | Can set it and read it | Hidden |
| `private` (the default) | Hidden | Hidden |

Use `protected` for a setting you don't want on the run form that other workflows, apps or
the assistant should still be able to pass in, and for results only callers need.

A variable without `visibility` is `private` everywhere: in runs, apps, the assistant and
MCP clients. Secret variables are never returned to apps, the assistant or MCP clients.
Set `visibility` explicitly on every variable, so the file says what you mean.

### Outputs

A public or protected variable is both an input and an output: callers can set it before
a run and read it after. Mark the ones the workflow fills in with `output: true`:

```yaml
- name: total
  type: number
  label: Total sales
  description: Sales for the month, in euros.
  visibility: public
  output: true
```

An output:

- isn't on run forms, the workflow overview or app forms, and the assistant never fills it in;
- can't be set by an app or a parent workflow — the run stops with an error if one tries;
- is read by callers when it's `public` or `protected`; a `private` output isn't returned to anyone.

Once a workflow marks any outputs, a run started by the assistant or an MCP client returns
only those (public or protected), not every public variable, so mark everything you want back.
A workflow that marks none returns all its public, non-secret variables, but not its protected ones. Their labels and descriptions go back with the
values, so the answer reads them right, and the assistant sees them when it chooses a
workflow. See [Writing workflows the assistant can find](/assistant/findable-workflows#outputs).

Don't make an output `required`: a required variable needs a value before the run starts.

## Descriptions

The workflow `description` is Markdown. The Desktop overview shows it formatted (bold, italics, links, lists, code), and `tipeline workflow info` shows it as styled terminal text. Lists, cards and search results only show its first paragraph, as one line of plain text, so put a short summary first:

```yaml
description: |
  Checks product prices every morning and **emails an alert** when one drops.

  - Reads the URLs from `products.csv`
  - Needs the [SMTP connection](https://example.com/smtp) set up first
```

Raw HTML is shown as text, and links only open `http(s)` and `mailto` addresses.

The assistant reads only that first paragraph to pick a workflow. For what to put in it, and in the name, tags and inputs, see [Writing workflows the assistant can find](/assistant/findable-workflows).

## Helper workflows

`helper: true` marks a workflow that other workflows run for its data, such as one that calls an API or looks up a customer's id. The assistant never offers it as the answer to a request, even when its name matches best. It still finds it when it drafts a workflow, and runs it there as a [sub-workflow step](/actions/subtask). You can still run it yourself from Desktop or the CLI.

In Desktop, turn on **Helper workflow** in the workflow's **Edit** dialog. Workflow lists show a **Helper** badge. See [Helper workflows and question workflows](/assistant/findable-workflows#helper-workflows-and-question-workflows) for when to split a workflow this way.

## Minimal Example

```yaml
name: Hello World
description: Prints a greeting.

pipeline:
  actions:
    - group: system
      name: message
      params:
        text: "Hello, World!"
```

## Complete Example

```yaml
name: Product Price Monitor
description: Scrape product prices and send an alert if they drop
author: ops-team
version: 1.2.0

pipeline:
  variables:
    - name: productUrl
      type: string
      value: "https://example.com/product/123"
      required: true
      description: URL of the product page to monitor
      visibility: public

    - name: threshold
      type: number
      value: 50.00
      description: Price threshold for alerts

    - name: alertEmail
      type: string
      value: "pricing@company.com"

    - name: browser
      type: browser

    - name: response
      type: object

    - name: priceText
      type: string

    - name: priceClean
      type: string

    - name: price
      type: string

  actions:
    # Launch headless browser
    - group: browser
      name: launch
      params:
        headless: true
      destination: browser

    # Navigate to product
    - group: browser
      name: goTo
      params:
        browser: "{= browser =}"
        url: "{{ productUrl }}"
      destination: response

    # Check page loaded
    - group: flow
      name: ifConditional
      params:
        firstOperand: "{= response.status =}"
        compareAs: number
        operator: neq
        secondOperand: 200
        actions:
          - group: system
            name: message
            params:
              text: "Failed to load page (status {{ response.status }})"

    # Extract price
    - group: browser
      name: getElement
      params:
        browser: "{= browser =}"
        selector: ".product-price"
        attribute: innerText
      destination: priceText

    # Parse to number
    - group: string
      name: replace
      params:
        string: "{{ priceText }}"
        pattern: "$"
        replacement: ""
      destination: priceClean

    - group: string
      name: replaceAll
      params:
        string: "{{ priceClean }}"
        pattern: ","
        replacement: ""
      destination: priceClean

    - group: math
      name: toFixed
      params:
        number: "{= priceClean =}"
        digits: 2
      destination: price

    # Alert if below threshold
    - group: flow
      name: ifConditional
      params:
        firstOperand: "{= price =}"
        compareAs: number
        operator: lte
        secondOperand: "{= threshold =}"
        actions:
          - group: email
            name: send
            params:
              host: "{{ _env.SMTP_HOST }}"
              port: 587
              user: "{{ _env.SMTP_USER }}"
              pass: "{{ _env.SMTP_PASSWORD }}"
              from: "automation@company.com"
              to: "{{ alertEmail }}"
              subject: "Price Alert: ${{ price }}"
              text: |
                The product at {{ productUrl }} dropped to ${{ price }}.
                Your threshold is ${{ threshold }}.

    # Clean up
    - group: browser
      name: close
      params:
        browser: "{= browser =}"
```

## Conditions

If, ElseIf and Conditional Loop check one condition: the value to check, how to read it
(`compareAs`: `string`, `number`, `date`, `boolean`, `array` or `object`), the comparison
and what to compare with.

```yaml
- group: flow
  name: ifConditional
  params:
    firstOperand: "{{ order.total }}"
    compareAs: number
    operator: gt
    secondOperand: 1000
    actions: [...]
```

See [Conditions](/workflows/conditions) for every type and its operators, how values are
converted and the array steps.

## Variable Override at Runtime

When running a workflow, you can override any variable:

```bash
tipeline workflow run monitor.yaml \
  --var productUrl=https://example.com/product/123 \
  --var threshold=45
```

## Environment Variables

Create a `.env` file next to your workflow YAML:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_USER=user@gmail.com
SMTP_PASSWORD=app-specific-password
```

Reference in templates: `{{ _env.SMTP_HOST }}`

## JSON Format

Workflows can also be written as JSON — same schema:

```json
{
  "name": "Hello World",
  "description": "Prints a greeting.",
  "pipeline": {
    "actions": [
      {
        "group": "system",
        "name": "message",
        "params": { "text": "Hello, World!" }
      }
    ]
  }
}
```

## Validation

Tipeline validates workflow files before running. You can also validate a file explicitly without executing it:

**CLI:**
```bash
tipeline workflow validate my-workflow.yaml
```

**Desktop:** The Workflow Builder validates the workflow in real time as you edit. A validation indicator appears in the toolbar showing whether the current workflow is valid.

The validator checks:
- Required fields (`name`, `description`, `pipeline.actions`)
- Valid action `group` and `name` values
- Correct parameter types per action schema
- Variable type constraints

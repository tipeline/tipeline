# Variables & Templates

Step parameters can use values from variables, the environment, global variables and the
previous step. Tipeline fills them in right before each step runs.

## Two syntaxes

| Syntax | Result | Use it for |
|--------|--------|-----------|
| `{{ name }}` | Always a **string** (LiquidJS) | Text: messages, URLs, file names. Supports filters and logic: `{{ name \| upcase }}`, `{% if %}` |
| `{= name =}` | The value **as it is** — number, object, array, browser, connection | Passing data and live handles to the next step. Must be the whole parameter value, with no text around it |

Both take dot and bracket paths: `{{ order.items[0].sku }}`, `{= response.data.users =}`.

```yaml
- group: browser
  name: goTo
  params:
    browser: "{= browser =}"            # the live browser from an earlier step
    url: "https://example.com/{{ slug }}"  # text built from a variable
```

## What you can reference

| Reference | Resolves to |
|-----------|-------------|
| `name` | A variable of this workflow |
| `_env.KEY` | An environment value — see [Environment files](#environment-files) |
| `_global.name` | A [global variable](/desktop/variables) |
| `_previous` | The result of the step right before this one |

Names starting with `_` are reserved for Tipeline, so a workflow variable can't be called
`_env`, `_global` or `_previous` (variable names must start with a letter or digit).

## Storing results

A step's `destination` stores its result in a variable. Prefix it with `_global.` to write a
global variable instead:

```yaml
- group: http
  name: request
  params:
    url: "{{ apiUrl }}/token"
  destination: tokenResponse        # a workflow variable

- group: object
  name: getProperty
  params:
    object: "{= tokenResponse =}"
    property: "data.access_token"
  destination: _global.apiToken     # a global variable, kept for later runs
```

The **Set variable** step (`variable.set`) takes the same `_global.` prefix in its `name`.

## `_previous`

`_previous` is the result of the step that ran just before, without storing it first:

```yaml
- group: math
  name: multiply
  params: { multiplier: 6, multiplicand: 7 }

- group: system
  name: message
  params:
    text: "Result: {{ _previous }}"     # → "Result: 42"
```

It walks into objects like any variable: `{{ _previous.name }}`.

It only reaches back one step, inside the same block: it's empty at the start of every loop
iteration and every If/Else branch. After an If, Switch or Else If step, it holds that
step's own bookkeeping, not the last data. Use a named variable for anything you need
further on.

## Environment files

`{{ _env.KEY }}` reads `KEY` from, in this order:

1. the environment Core was started with,
2. a `.env` file next to the workflow file (only when you run a file, e.g.
   `tipeline workflow run report.yaml`),
3. `~/Tipeline/.env`.

```ini
# ~/Tipeline/.env
SMTP_HOST=smtp.gmail.com
API_KEY=your-key-here
```

A variable can also take its default from the environment or a global variable:

```yaml
pipeline:
  variables:
    - name: apiKey
      type: string
      secret: true
      valueFromEnv: API_KEY          # or valueFromGlobal: apiKey
```

A value passed in when the run starts (a run form, `--var`, an app) wins over these defaults.

### Where secret values are kept

- **Global secrets** are encrypted in the database, and so are the secret values a run keeps,
  including any variable a step copied a secret into. A run that can still resume keeps them
  encrypted; a run that completes erases them.
- **Assistant API keys, hub tokens and remote tokens** are encrypted in the database the same way.
- **Exports and backups** leave secret values out unless you ask for them.
- A token a workflow saves to a file (some OAuth examples use `~/Tipeline/.tokens/token.json`) stays
  as that workflow wrote it. Keep tokens in a secret global variable instead.
- **On a Tipeline Server**, viewers see secret values as empty, and only admins can read API keys and
  tokens ([who can see what](/server/#who-can-see-credentials)).
- The key is in `~/Tipeline/.database/secret.key`. It protects the database when it's copied on its
  own, not from someone who can read your whole home folder. Back it up along with the database:
  without it, encrypted values can't be read and have to be set again.
- A value **written into the workflow** (`value:` on a secret variable) stays readable in the saved
  workflow, so prefer `valueFromGlobal` or `valueFromEnv`.

## Overriding variables when you run

```bash
tipeline workflow run report.yaml --var month=2026-04 --var format=pdf
```

Apps, sub-workflows and the assistant can only set `public` and `protected` variables. See
[Visibility](/workflows/files#visibility).

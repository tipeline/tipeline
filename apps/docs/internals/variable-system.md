# Variable System

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

Variables are the data layer of a pipeline. They carry values between actions, expose environment configuration, and enable dynamic parameterization via templates.

## Variable Types

| Type | Description |
|------|-------------|
| `string` | Plain text |
| `number` | Numeric (integer or float) |
| `boolean` | `true` / `false` |
| `date` | ISO 8601 date string |
| `array` | JSON array |
| `object` | JSON object |
| `oauthToken` | A token object from an OAuth action (global variables only) |
| `workbook`, `audio`, `video` | Spreadsheet and media values that can be serialized |

There's also a set of **live handle types** — `browser`, `sshConnection`,
`dbConnection`, and `image` — produced by actions like `browser.launch`,
`ssh.connect`, and `database.connect`, then passed to later actions via
`destination`/`{= =}`. They hold an in-memory object (an open connection or
process handle), not a plain value, so they can only be used as **task-scoped
variables** — see [Global Variables](#global-variables) below for why they
can't be global.

## Variable Scopes

| Scope | Where defined | Lifetime |
|-------|--------------|---------|
| `task` | Task YAML `variables` section | For the duration of the pipeline run |
| `env` (read as `_env.KEY`) | `.env` files (task dir or `~/.tipeline/.env`) | Process lifetime |
| `global` (read and written as `_global.name`) | Database `global_variable` table | Persistent across runs |
| `core` | Set internally by the engine | Pipeline run |

## Defining Variables in a Task

```yaml
variables:
  - name: apiUrl
    type: string
    value: "https://api.example.com"

  - name: retryCount
    type: number
    value: 3

  - name: results
    type: array
    value: []

  - name: credentials
    type: object
    secret: true         # masked in UI and logs
    required: true       # must be provided at runtime
```

### Variable Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Variable identifier used in templates |
| `type` | string | One of the types above |
| `value` | any | Default value |
| `required` | boolean | Must be supplied as a runtime override |
| `secret` | boolean | Masked in logs and UI |
| `readonly` | boolean | Cannot be changed during execution |
| `description` | string | Human-readable description |
| `visibility` | `public` \| `protected` \| `private` | Controls exposure on the task overview form and to callers: a parent task via `subtask.exec`, apps, the assistant and MCP clients — see [Visibility](#visibility) below |

### Naming Convention

Use `camelCase` for variable names (e.g. `apiUrl`, `retryCount`), matching the
casing used everywhere else in Tipeline — action param names, group names,
and the underlying TypeScript. `snake_case` also works (`name` is just a
string key), but mixing styles in the same task file reads inconsistently
against `params:` keys, which are always camelCase.

### Visibility

Task variables take a `visibility` field with three levels:

| Level | Shown on task overview form | Readable/writable by callers (`subtask.exec` `props`/`outputs`, apps, assistant, MCP) |
|-------|:---:|:---:|
| `public` | Yes | Yes |
| `protected` | No | Yes |
| `private` (default) | No | No — throws if a parent tries |

Use `protected` for variables that should stay off the run/overview form —
internal wiring a user shouldn't be prompted for — but still need to flow in
or out when this task is invoked as a subtask via `subtask.exec`, by an app, or by the
assistant (`WorkflowCatalog.workflowInputs`/`workflowOutputs`). Use
`private` for variables that must never leave this task, even when it's
called as a subtask.

## Template Substitution

Tipeline uses two substitution mechanisms.

### LiquidJS Templates `{{ }}`

Used for **string interpolation**. The full [LiquidJS](https://liquidjs.com/) template syntax is supported — filters, conditionals, loops.

```yaml
params:
  url: "{{ baseUrl }}/{{ path }}"
  message: "Hello, {{ name | upcase }}!"
  body: "{% if count > 1 %}items{% else %}item{% endif %}"
```

LiquidJS templates always produce a **string**. Use them when you need text output.

Available namespaces:

| Namespace | Example | Description |
|-----------|---------|-------------|
| *(none)* | `{{ name }}` | Task variable |
| `_env` | `{{ _env.API_KEY }}` | Environment variable (`.env` file or the process) |
| `_global` | `{{ _global.token }}` | Global variable from DB |
| `_previous` | `{{ _previous.name }}` | The previous action's result, in the same block |

Variable names can't start with `_`, so a task variable can never shadow these. Writing to a
global uses the same prefix: `destination: _global.apiKey`. See
[Variables & Templates](/workflows/variables) for the user-facing guide.

### Raw Injection `{= =}`

Used to pass a **non-string value** (object, array, number, boolean, or live handle) directly as a parameter value. The `{= =}` expression **must be the entire value** — it cannot be embedded inside a larger string.

```yaml
# Correct: pass browser handle to next action
params:
  browser: "{= browser =}"
  data:    "{= parsedObject =}"

# Correct: inject a number
params:
  count: "{= retryCount =}"

# Wrong: cannot embed {= =} inside a string
params:
  message: "count is {= count =}"  # use {{ count }} instead
```

Raw injection supports the same namespaces:

```yaml
params:
  key: "{= _env.SECRET_KEY =}"
  token: "{= _global.authToken =}"
```

## Capturing Action Results

Every action that produces a meaningful result can write it to a variable via the `destination` field:

```yaml
- group: http
  name: request
  params:
    url: "{{ apiUrl }}"
    method: get
  destination: apiResponse

- group: object
  name: getProperty
  params:
    object: "{= apiResponse =}"
    property: "data.users"
  destination: users

- group: array
  name: length
  params:
    array: "{= users =}"
  destination: userCount
```

## Global Variables

Global variables are stored in the `global_variable` database table and are available to every task run. They can be managed via the CLI or Desktop app.

```bash
# CLI
tipeline variable list
tipeline variable set myToken --type string --value "abc123" --secret
```

Global variables don't have a `visibility` field — they're shared across
every task rather than scoped to one, so the per-task overview/subtask
gating described [above](#visibility) doesn't apply. Use `secret` to mask a
global variable's value and `readonly` to prevent tasks from overwriting it.

### Unsupported Global Types

The live handle types — `browser`, `sshConnection`, `dbConnection`, and
`image` — cannot be used for a global variable. Every global variable
read/write round-trips through `JSON.stringify`/`JSON.parse` against the
`global_variable` table, and each task run executes in its own worker
thread, so a live handle can neither survive serialization (Puppeteer's
`Browser` object, for example, has circular references and throws on
`JSON.stringify`) nor cross the thread boundary as a JS reference. Creating
or editing a global variable with one of these types is rejected at
validation time — the Desktop **Variables** form doesn't offer them, and the
CLI/API reject them with `Invalid variable type: <type>`.

If you need a browser (or other live resource) to persist across separate
task runs, keep it as a task-scoped variable within a single task/pipeline
run instead — global variables are for durable, serializable state (tokens,
config, counters), not live process handles.

## Environment Variables

Load a `.env` file next to your task YAML for per-task secrets, or use `~/.tipeline/.env` for global defaults:

```ini
# ~/.tipeline/.env
API_KEY=secret123
DB_PASSWORD=hunter2
```

Then reference them in any template:

```yaml
params:
  headers:
    Authorization: "Bearer {{ _env.API_KEY }}"
```

## Variable Class Internals

The `Variable` class (`src/variable/Variable.ts`) handles coercion and validation:

- Ensures the value matches the declared `type` (coerces strings to numbers/booleans when needed)
- Tracks whether the variable is `readonly`, `required`, `secret`
- Provides a typed `getValue()` method

Global variables are **lazy-loaded** per block — only fetched from the database when an action's params actually reference `_global.*`. This avoids unnecessary DB calls.

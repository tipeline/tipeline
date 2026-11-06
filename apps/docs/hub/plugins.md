# Plugins

A **plugin** adds a group of actions to Tipeline — for example `drupal.createContent` or
`googledocs.createDoc` — without changing Tipeline itself. Plugin steps work like built-in
ones: in the builder, in workflow files, in apps and with the assistant.

## Installing a plugin

- **From a hub:** open **Hub → Plugins** and click **Install**, or run
  `tipeline hub install plugin <hubId> <identifier>`. See [Hubs](/hub/).
- **By hand:** put the plugin's folder in `~/.tipeline/plugins/` (for example
  `~/.tipeline/plugins/drupal/index.mjs`), then open **Plugins**. If it has a `package.json`
  with dependencies, run `npm install` in its folder first.

A new plugin is listed **turned off**, because its code runs inside Core with full access to
your computer. Read it, or trust where it came from, then turn it on with its switch. Its
actions are available right away.

## Managing plugins

**Plugins** in the sidebar lists every plugin, with its version, author and switch. Opening
the page rescans `~/.tipeline/plugins/`. Turning a plugin off tells you which workflows use
it: their steps can't run while it's off.

| Warning | What it means | What to do |
|---------|---------------|-----------|
| Group conflict | Its `group` is already used by a built-in group or another plugin, so it wasn't loaded | Rename `group` in the plugin's `index.mjs`, then restart Core |
| Folder missing | Its folder was moved or deleted | Put the folder back, or remove the listing |

The examples in the repo's `examples/plugins/` folder (`greeting`, `invoicing`, `drupal`,
`google-docs`, `text-case`) are a good starting point.

## Writing a plugin

A plugin is a folder with an `index.mjs` (or `index.js`) whose default export describes the
group:

```js
// ~/.tipeline/plugins/greeting/index.mjs
export default {
  group: 'greeting',                 // required — the action group, unique
  name: 'Greeting Plugin',
  description: 'Builds simple greeting and farewell messages.',
  author: 'Tipeline',
  version: '1.0.0',

  actions: {                         // required — one async function per action
    async sayHello(params) {
      const name = params?.name?.trim();
      if (!name) throw new Error('greeting.sayHello: "name" param is required');
      return `Hello, ${name}!`;
    },
  },

  params: {                          // the form the builder shows, and validation
    sayHello: [{ name: 'name', type: 'string', label: 'Name', required: true }],
  },
};
```

```yaml
- group: greeting
  name: sayHello
  params:
    name: "{{ userName }}"
  destination: greeting
```

An action receives its parameters with templates already filled in, and returns its result.
Throw an `Error` to fail the step; the message is shown in the run.

### Export reference

| Key | Required | What it does |
|-----|:--------:|--------------|
| `group` | ✓ | The action group. Must not clash with a built-in group or another plugin. |
| `actions` | ✓ | `{ actionName: async (params) => result }` |
| `name`, `description`, `author`, `version` | | Shown on the Plugins page. `version` is free text. |
| `image` | | A URL, or a path inside the plugin folder |
| `params` | | Per action: the fields the builder shows. Also turned into validation that runs before every step. |
| `docs` | | Per action: `{ description, example }` shown in the builder |
| `returns` | | Per action: the result's type (`string`, `number`, `boolean`, `object`, `array`, `any`), so the builder offers the right variables as `destination` |
| `rules` | | Per action: fields that become required when another field has a value |
| `cacheable` | | Action names whose results may be [cached](/workflows/caching#plugins) |

### Parameter fields

```js
params: {
  sendInvoice: [
    { name: 'email', type: 'string', label: 'Email', required: true, pattern: '^[^@]+@[^@]+$' },
    { name: 'currency', type: 'string', enum: ['USD', 'EUR'], default: 'USD' },
    { name: 'amount', type: 'number', min: 0, precision: 2 },
    { name: 'sendCopy', type: 'boolean', default: false },
    { name: 'ccEmail', type: 'string' },
    { name: 'connection', type: 'variable' },
  ],
},
rules: {
  sendInvoice: [{ when: { field: 'sendCopy', equals: true }, require: ['ccEmail'] }],
},
```

| Field | Meaning |
|-------|---------|
| `name` | Parameter name |
| `type` | `string`, `number`, `boolean`, `date`, `html`, or `variable` — a live value from an earlier step (a browser, a connection), picked from the step's variables and passed as `{= name =}` |
| `component` | `textarea` for long text, `datetime` for a date and time |
| `label`, `description` | Shown in the builder |
| `default`, `required` | Default value, and whether it must be set |
| `enum` | Allowed values (strings); shown as a dropdown |
| `pattern` | A regular expression the string must match |
| `min`, `max` | Number limits, or string length limits |
| `precision` | Maximum decimal places for a number |

Every field except `variable` also accepts a `{{ }}` or `{= =}` template.

### Credentials

Don't put keys or passwords in the plugin. Take them as parameters, so workflows can pass
them from [global variables](/desktop/variables) or `_env`:

```yaml
- group: drupal
  name: getContent
  params:
    baseUrl: "{{ _env.DRUPAL_BASE_URL }}"
    auth: "Basic {{ _global.drupalAuth }}"
    contentType: article
    uuid: "{{ uuid }}"
```

### Trying it out

1. Put the folder in `~/.tipeline/plugins/`.
2. Open **Plugins** (it rescans the folder) and turn the plugin on.
3. Add one of its steps in the builder, or run a workflow file with
   `tipeline workflow run`.

After editing `index.mjs`, restart Core (`tipeline stop`, then `tipeline start`) to load the
new code: Node keeps the first version of a module it imported.

### Publishing

Zip the folder (with `index.mjs` at the root of the zip) and add it to a hub's `hub.json`
with `"type": "plugin"` and its `group`. See [Publishing to a Hub](/hub/publishing#plugins).

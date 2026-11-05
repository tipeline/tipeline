<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Script Actions

## General

### `runScript`

Runs a short JavaScript snippet inside a vm2 sandbox and returns its result.

Use it to compute a value — reshape a list, build text, work out a date —
from the values you pass in `context`. The code is the body of an async
function: `await` works, and `return` hands the value back to the step.

**The script is plain JavaScript, not Node.js.** It can't reach anything
outside itself:

- No `require` or `import`, so no Node.js modules (`fs`, `path`, `os`,
  `child_process`…) and no npm packages.
- No `process`, `global` or `module`: no environment variables, no home
  folder, no current directory.
- No files, folders, network (`fetch`), timers (`setTimeout`) or shell
  commands.
- Workflow variables aren't visible by themselves: pass each one in
  `context`. Only plain values (text, numbers, true/false, lists, plain
  objects) go through; opened things such as a browser, a connection or an
  image don't.

Built-in JavaScript (`Math`, `JSON`, `Date`, `Intl`, `RegExp`, arrays,
strings) and `Buffer` are available. A `log(...)` helper writes debug output.

For work outside the script, use the matching actions and pass their
results in: the file and folder actions to list, read, rename or move
files; the http actions for web requests; `system.runApplication` to run a
command on this computer.

**Returns:** The value returned by the script, or `undefined` if nothing is returned.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `code` | string | ✓ | — | Plain JavaScript (the body of an async function): use return to give back the result. No require, import or process. |
| `context` | Record&lt;string, any&gt; |  | — | Values the script can use, by name, e.g. { items: '{= items =}' }. Only text, numbers, true/false, lists and objects. |

```yaml
# Compute a derived value from pipeline variables and return it
- group: script
  name: runScript
  params:
    code: |
      const full = firstName + ' ' + lastName;
      return full.toUpperCase();
    context:
      firstName: '{{ firstName }}'
      lastName: '{{ lastName }}'
```

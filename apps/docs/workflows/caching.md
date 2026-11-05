# Caching Results

A step or a whole workflow can keep its result for a while and reuse it when it runs again with the same values. Use it for slow or paid work whose answer doesn't change every minute: an API lookup, an AI prompt, OCR on a file, a report query, or a workflow an app calls every time it opens.

A reused result costs a database read. For the Team Directory example app, opening the page went from about 1.1 s to a few milliseconds.

::: warning A cached step doesn't run
When a result is reused, the step is skipped — so anything else it would have done doesn't happen either. That's why only steps that just compute or read something can be cached. Steps that send, write, launch or change something can't.
:::

## Try it

Two examples in the repository show it working:

- **`examples/workflows/caching-step-demo.yml`** — a step that takes 2 seconds, cached for 2 minutes. Run it twice with `tipeline workflow run`: the second run is instant and the lookup is marked *cached*. Add `--var city=Quito` for a new entry, `--refresh-cache` or `--no-cache` to skip it.
- **`examples/apps/cache-demo.yml`** — an app whose report workflow takes 2 seconds and is cached for 2 minutes. Install it, open it, switch regions and back, then press *Refresh (skip the cache)*. *Built at* only changes when the workflow really ran.

## Cache a step

Add `cache` with how long to keep the result:

```yaml
actions:
  - group: http
    name: request
    params:
      url: https://api.example.com/rates
    destination: rates
    cache:
      ttl: 1h
```

The first run calls the API and stores the result. For the next hour, a run with the same `url` gets the stored result. After that, the step runs again and stores a new one.

**`ttl`** is how long a result is kept: a number of seconds, or `30s`, `15m`, `1h`, `1d` (at most 30 days). Lowering it applies right away to results already stored.

**`key`** (optional) lists the params that decide whether two runs are "the same". By default every param counts. Leave out ones that don't change the answer:

```yaml
    cache:
      ttl: 1h
      key: [url]          # a different timeout still reuses the result
```

In the Desktop builder, open the step and pick a time under **Cache result**. The field only appears on steps that can be cached.

### What counts as "the same values"

The values the step actually ran with, after `{{ }}` and `{= =}` are filled in. Also:

- A file the step reads counts by its size and when it last changed. Edit the file and the step runs again.
- A database query counts by the database it points at, never by its password.
- A step whose params hold something that isn't plain data (a browser session, for example) is never cached.

### Which steps can be cached

| Can be cached | Can't be cached |
|---|---|
| String, array, object, math, date, HTML, XML transforms | Anything random or about the current time (`math.random`, `array.shuffle`, `datetime.nowISO`) |
| `http.request` and `api.request` with GET or HEAD | Requests that send data (POST, PUT, DELETE…) |
| `database.query` with SELECT / WITH / EXPLAIN | Queries that change data; connecting and closing |
| `ai.prompt`, `ocr.recognize`, `pdf.extractText`, `pdf.getPageCount` | Email, SSH, browser, spreadsheet, system steps |
| Reading files and folders, file hashes, image/video/audio info | Writing, moving or deleting files |
| `script.runScript` — your code; caching it says it has no side effects | Approvals, sub-workflows (use the workflow cache), `variable.set` |

Plugin steps can be cached only when the plugin lists them (see [Plugins](#plugins)).

## Cache a workflow

When an app or a parent workflow asks a workflow for its outputs, the whole workflow can be cached:

```yaml
name: List People
description: Lists the people in a department.
cache:
  ttl: 5m
  inputs: [department]    # optional: only these inputs decide what's "the same"

pipeline:
  variables:
    - name: department
      type: string
      visibility: public
    - name: people
      type: array
      visibility: public

  actions:
    - ...
```

When the outputs are cached, nothing runs: Tipeline answers before it even starts a run, so this is where apps get faster.

It applies when:

- an **app** runs the workflow (its runnable asks for outputs), or
- a **sub-workflow** step (`subtask.exec` by identifier) reads its `outputs`.

Running the workflow yourself from the Desktop or the CLI always runs it: those runs ask for no outputs.

What decides whether two calls are "the same":

- the inputs (all of them, or the ones in `inputs`),
- the values it reads from global variables and the environment,
- which outputs were asked for, and
- the workflow itself: **editing the workflow starts fresh**.

Only runs that finish are stored. A failed, canceled or paused run never is.

A workflow can only be cached if every step in it could be skipped safely, so it can't contain any of the steps in the right-hand column above, or write a global variable. Setting its own variables and flow control (conditions, loops) is fine.

In the Desktop, open the workflow, choose **Edit info**, and pick a time under **Cache outputs**. If the workflow can't be cached, the dialog lists the steps that stop it.

## Run without the cache

Sometimes you want the real thing:

| Where | Skip the cache | Run and replace what's stored |
|---|---|---|
| Desktop, workflow page | Menu beside **Run** → *Run without the cache* | *Run and refresh the cache* |
| CLI | `tipeline workflow exec <id> --no-cache` | `--refresh-cache` |
| App | — | A **Run** action with *Skip the cache* ticked (`refresh: true`) — for a refresh button |

These only affect cached **steps** — a run from the Desktop or the CLI never uses the workflow cache anyway — so the Desktop menu appears only when a step has a cache setting. To get fresh outputs for an app, use its refresh action.

A debug run never uses the workflow cache. Cached steps inside it still reuse their results, marked *Cached* in the timeline and the log — handy when you're debugging a later step. To debug a cached step itself, pick *Run without the cache* (or *Run and refresh the cache*) in the debugger's toolbar before pressing Run or Next; the choice appears when a step has a cache setting.

## See what's cached

- **Run details** mark a cached step with a *Cached* badge. A run answered from the workflow cache says so, and links to the run that produced its outputs.
- **Apps**: the run status line shows *From the cache · stored 3m ago*, and bindings can read `runnables.<name>.cachedAt` (null when the outputs are fresh).
- **Settings → Cache** lists stored results with their size, how often they were reused and when they expire. Delete one, or clear everything.
- **CLI**: `tipeline cache list [--workflow <id>]`, `tipeline cache clear --workflow <id>` or `--all`.

The cache is kept in Tipeline's database and shared by every run. It has a size limit (100 MB by default, set in **Settings → Cache**); past it, the oldest results are deleted first. Expired results are cleaned up every 10 minutes.

::: info Shared results
Stored results are shared by everyone who runs the same thing with the same values — on a Tipeline Server too. A workflow's answer should depend only on its inputs and settings. Results are stored as plain text in the database, and a secret variable's value is never stored as a workflow output.
:::

## Plugins

A plugin lists the actions that can be cached in a `cacheable` export. The plugin's version is part of what decides "the same", so updating the plugin starts fresh.

```js
export default {
  group: 'weather',
  version: '1.2.0',
  actions: { forecast, subscribe },
  cacheable: ['forecast'],   // never `subscribe`: it changes something
};
```

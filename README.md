<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-light.svg">
    <img src="assets/logo-dark.svg" alt="Tipeline" height="56">
  </picture>
</p>

<p align="center">
  <strong>Workflow automation and orchestration you can run on your own machine.</strong><br>
  Build workflows visually or as YAML, put apps on top of them, and ask for them in plain language.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License: Apache 2.0"></a>
  <img src="https://img.shields.io/badge/node-24-339933" alt="Node 24">
</p>

---

## What is Tipeline?

Tipeline runs automation workflows: open a browser and fill a form, read a PDF, call an API,
query a database, send an email, run a script over SSH, and chain the results together. A
workflow is one plain YAML file that runs the same way from the Desktop app, the CLI, a
schedule, an app or the Assistant.

- **30+ action groups**: browser automation (Puppeteer), AI prompts, HTTP and APIs, SSH,
  email, OCR, PDF, spreadsheets, databases, files, images, audio, video and more.
- **Real flow control**: loops, conditions, sub-workflows and human approvals.
- **Resume and debug**: every step's result is saved, so you can resume a failed run from the
  step that failed or step through a run one action at a time.
- **Apps on your workflows**: dashboards, forms and tools with tables, charts, kanban boards,
  calendars and chat, with no front end to write.
- **Assistant**: describe what you need; it finds the right workflow, fills in the inputs and
  runs it once you confirm, or drafts a new workflow for you.
- **Runs locally**: your data stays on your machine in SQLite. Share with a team through
  Tipeline Server.

## A workflow

```yaml
name: My First Workflow
description: Opens a web page and prints its title.

pipeline:
  variables:
    - name: url
      type: string
      value: "https://example.com"
      visibility: public
    - name: browser
      type: browser
    - name: pageTitle
      type: string

  actions:
    - group: browser
      name: launch
      params: { headless: true }
      destination: browser

    - group: browser
      name: goTo
      params: { browser: "{= browser =}", url: "{{ url }}" }

    - group: browser
      name: getPageTitle
      params: { browser: "{= browser =}" }
      destination: pageTitle

    - group: system
      name: message
      params: { text: "Page title: {{ pageTitle }}" }
```

```bash
tipeline install   # first time only
tipeline start
tipeline workflow run my-first-workflow.yaml
```

## What's in this repository

| Path | What it is |
|---|---|
| [`apps/core`](apps/core) | The engine that runs workflows, stores runs and serves IPC, WebSocket and MCP |
| [`apps/desktop`](apps/desktop) | Electron + Vue desktop app for building workflows and apps |
| [`apps/cli`](apps/cli) | The `tipeline` command-line tool |
| [`apps/server`](apps/server) | Tipeline Server: multi-user gateway in front of a Core |
| [`apps/docs`](apps/docs) | Documentation site (VitePress) |
| [`packages/*`](packages) | Shared schemas, types, utilities, translations and the Assistant |
| [`examples`](examples) | Example workflows, apps and plugins |

## Run from source

Requires **Node.js 24** (see `.nvmrc`; with nvm, run `nvm use`). Some actions also use tools
from your system:

- **Chrome or Chromium** for browser actions, including the example above
- **ffmpeg** (with `ffprobe`) for audio and video actions

```bash
npm install
npm run build

# Desktop app (starts Core for you)
npm -w apps/desktop run dev

# Or the CLI
cd apps/cli && npm link
tipeline install   # first time only
tipeline start
```

Run the tests with `npm test`. Browse the docs locally with
`npm -w apps/docs run dev`, starting at the
[introduction](apps/docs/guide/introduction.md) and
[quick start](apps/docs/guide/quick-start.md). The
[developer setup guide](apps/docs/internals/setup.md) has the full details.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Everyone signs the
[Contributor License Agreement](CLA.md) once, through a bot on their first pull request. If
you contribute for your employer, your company also signs the
[Corporate CLA](CLA-CORPORATE.md).

## License and trademarks

Tipeline is open source under the [Apache License 2.0](LICENSE).
Copyright © 2022-2026 José Daniel Estrada Guzmán. See [NOTICE](NOTICE).

"Tipeline" and the Tipeline logo are trademarks of José Daniel Estrada Guzmán and are not covered by
the Apache License. You are welcome to fork the code, but a modified version you distribute
needs its own name. See the [trademark policy](TRADEMARKS.md) for what you can do without
asking.

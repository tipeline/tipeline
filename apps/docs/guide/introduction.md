# Introduction

Tipeline is an automation platform: you compose reusable **workflows** from 30+ groups of actions, build **apps** on top of them, and run them from the Desktop app, the terminal, a shared server or an AI assistant.

## What is Tipeline?

Tipeline treats automation as a sequence of **actions** grouped into a **pipeline**. A pipeline runs inside a **workflow**, which is defined as a YAML or JSON file. Each action belongs to a category (browser, file, string, AI, …) and receives typed parameters that can include variable templates.

The system is built around three key ideas:

- **Declarative workflow definitions** — describe *what* to do in YAML; Tipeline handles *how* to execute it.
- **Live pipelines** — every execution is persisted to SQLite with full per-action status, enabling pause, resume, and debug step-through.
- **One engine, many ways in** — the Desktop app, the CLI, the Tipeline Server and AI tools (over MCP) all drive the same Core engine.

## The pieces

| Piece | What it is | Docs |
|-------|-----------|------|
| **Core** | The engine that runs workflows and stores their runs. Runs in the background on your computer (or a server). | [Internals](/internals/overview) |
| **Desktop** | The app: build workflows and apps, watch runs, approve, schedule. Starts Core for you. | [Desktop](/desktop/overview) |
| **CLI** | `tipeline` in the terminal: run, install and schedule workflows, use hubs, ask the assistant. | [CLI](/cli/commands) |
| **Assistant** | Ask in plain language; it finds the workflow, fills it in and runs it when you confirm. In the Desktop, the CLI, or any MCP client. | [Assistant](/assistant/) |
| **Hubs & plugins** | Catalogs of workflows, apps and plugins to install — a website or a shared folder. Plugins add new action groups. | [Hub & Plugins](/hub/) |
| **Server** | Shares one Core with a team: accounts, roles, API tokens, webhooks, audit log. | [Server](/server/) |

## Key Concepts

### Actions
An action is the smallest unit of work. It belongs to a **group** (e.g. `browser`, `string`, `http`) and has a specific **name** (e.g. `goTo`, `replace`, `request`). Actions declare typed parameters and return a typed result that can be captured into a variable.

### Workflows
A workflow is a YAML or JSON file with a name, a description and a `pipeline` of variables and actions. Installed workflows are stored in Core's database under a unique `identifier`. (In the code and the database a workflow is still called a *task*.)

### Runs
A run (a *pipeline* in the code) is the record of one execution of a workflow. It stores every action's status, result, and variables at the time of execution. Pipelines support **resume** — if a workflow fails at action N, it can be restarted from action N without re-running earlier steps.

### Variables
Variables are the glue between actions. An action's `destination` field captures its result into a named variable, and any later action can reference it via `{{ varName }}` templates or `{= varName =}` raw injection. See [Variables & Templates](/workflows/variables).

### Apps
An app is a set of pages — tables, forms, charts and more — where every button and table runs a workflow. See [Apps](/apps/).

## Next Steps

- [Installation](/guide/installation) — set up Tipeline on your machine
- [Quick Start](/guide/quick-start) — run your first workflow in minutes
- [Workflow Files](/workflows/files) — every field of a workflow
- [Architecture Overview](/internals/overview) — how the pieces fit together

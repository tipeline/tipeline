# Architecture Overview

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what the internals pages use.
:::

Tipeline is an **npm workspace monorepo**. One engine, **Core**, runs every workflow; everything
else is a way to reach it.

## Repository Layout

```
tipeline/
├── apps/
│   ├── core/          # Execution engine (Node.js) — runs workflows, owns the SQLite database
│   ├── desktop/       # Electron + Vue 3 app — build workflows and apps, watch runs
│   ├── cli/           # Commander.js terminal client (`tipeline …`)
│   ├── server/        # Tipeline Server — multi-user gateway in front of a Core (Postgres)
│   └── docs/          # This documentation site (VitePress)
├── packages/
│   ├── schemas/       # Zod schemas for actions, workflows and apps
│   ├── types/         # Shared TypeScript types
│   ├── utils/         # Shared utilities (generateIdentifier, …)
│   ├── i18n/          # Translations (en, es)
│   └── agent/         # The assistant: LLM providers, MCP client, request and draft loops
├── examples/          # Example workflows, apps and plugins (also used by tests)
└── assets/            # Brand assets (logos)
```

Core's database migrations live in `apps/core/src/database/migrations`; the Server's in
`apps/server/src/db/migrations`.

## System Architecture

```
  Desktop (Electron)      CLI            AI clients            Remote users / scripts
  renderer → main         tipeline …     (assistant, Claude,   (Desktop, CLI, HTTP)
        │                    │            Cursor, bots)                │
        │ node-ipc           │ node-ipc        │ MCP over HTTP          │ REST + WebSocket
        ▼                    ▼                 ▼ :4002                  ▼ :4001
┌──────────────────────────────────────────────────────┐     ┌──────────────────────┐
│                 Core engine (apps/core)               │◀────│  Tipeline Server      │
│                                                       │ IPC │  (apps/server)        │
│  Transports: IPC · WebSocket :4000 · MCP :4002        │     │  users, roles, MFA,   │
│  Engine:     Core.ts · handlers/ · HubPoller · cache  │     │  tokens, webhooks,    │
│  Orchestration: Task · TaskFactory · Pipeline · Block │     │  audit log (Postgres) │
│  Actions:    ActionRegistry (32 groups) + plugins     │     └──────────────────────┘
│  Jobs:       Bree worker threads (default) | BullMQ   │
│  Storage:    SQLite (better-sqlite3, Knex, Objection) │
└──────────────────────────────────────────────────────┘
```

## How each client reaches Core

| Client | Transport | Auth |
|--------|-----------|------|
| **Desktop** | Renderer → Electron main (`contextBridge`) → node-ipc socket | Local socket |
| **CLI** | node-ipc socket; or Core's WebSocket after `tipeline remote use` | Local socket / Core API token |
| **Assistant and AI clients** | MCP (streamable HTTP) on port `4002` | Core API token |
| **Remote scripts** | Core's own WebSocket on port `4000` | Core API token (one shared secret) |
| **Tipeline Server** | node-ipc socket to a Core on the same machine | Server accounts and tokens, checked by the Server |

The **Core API token** is created on first start and saved to
`~/Tipeline/.database/core.token`. Anyone holding it has full access to that Core.

### IPC (local)

node-ipc uses Unix domain sockets on macOS/Linux and named pipes on Windows. Every request
channel has a matching response channel (`taskList` → `onTaskList`). See [IPC Protocol](/internals/ipc).

### WebSocket (remote)

Core exposes the same message protocol over WebSocket (`TIPELINE_WS_PORT`, default `4000`).
For several users, roles and audit, put the [Tipeline Server](/server/) in front instead.

### MCP (AI clients)

Core embeds an MCP tool server (`TIPELINE_MCP_PORT`, default `4002`). The built-in assistant
uses it, and so can any MCP client. See [Connect AI tools (MCP)](/assistant/mcp).

## Jobs and schedules

Runs are handed to a **job runner**:

- **Bree** (default): each run is a worker thread inside Core. Nothing to install.
- **BullMQ**: runs go on a Redis queue, and worker processes — possibly on other
  machines — pick them up. Opt-in through `~/Tipeline/config.json`.

Schedules are registered with the same runner (Bree cron, interval or date jobs, or BullMQ
repeatable and delayed jobs),
so manual and scheduled runs follow the same path. See [Job Runners](/internals/job-runners).

## Shared Packages

```
apps/core     ──┬──▶ @tipeline/schemas  (Zod validation)
apps/desktop  ──┼──▶ @tipeline/types    (TypeScript types)
apps/cli      ──┼──▶ @tipeline/utils    (generateIdentifier)
apps/server   ──┼──▶ @tipeline/i18n     (translations)
                └──▶ @tipeline/agent    (assistant — Desktop main process and CLI)
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (ES modules throughout) |
| Runtime | Node.js 24 |
| Build | Vite, tsc + tsc-alias |
| Core database | SQLite via better-sqlite3, Knex migrations, Objection.js ORM |
| Server database | PostgreSQL via Knex + Objection |
| Jobs | Bree (default), BullMQ + Redis (optional) |
| Browser automation | Puppeteer (uses a locally installed Chrome or Chromium) |
| Template engine | LiquidJS |
| Validation | Zod |
| Desktop UI | Electron, Vue 3, Pinia, Reka UI, Tailwind CSS |
| CLI | Commander.js, chalk, cli-table3 |
| Transports | node-ipc, WebSocket (ws), MCP (`@modelcontextprotocol/sdk`) |

## Detailed Sections

- [Core Engine](/internals/core-engine) — action system, task factory, engine API
- [Pipeline System](/internals/pipeline) — blocks, resume, debug, events
- [Variable System](/internals/variable-system) — scopes, substitution, global variables
- [Execution Flow](/internals/execution-flow) — step-by-step walkthrough of a run
- [Job Runners](/internals/job-runners) — Bree, BullMQ and distributed workers
- [Database Schema](/internals/database)

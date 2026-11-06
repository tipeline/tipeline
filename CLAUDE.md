# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tipeline is a task/automation orchestration platform with five applications and five shared packages in an npm workspace monorepo.

- **apps/core** — Node.js engine that executes automation tasks (browser, file, email, SSH, OCR, PDF, database, etc.)
- **apps/cli** — Commander.js CLI that controls the core engine via IPC
- **apps/desktop** — Electron + Vue 3 desktop UI for building and managing tasks
- **apps/server** — Tipeline Server: multi-user gateway (Postgres) in front of a Core
- **apps/docs** — VitePress documentation site (user guides and internals)
- **packages/schemas** — Zod schemas for all 30+ action types
- **packages/types** — Shared TypeScript type definitions
- **packages/utils** — Shared utilities (e.g., `generateIdentifier()`)
- **packages/i18n** — i18next-based translations with file-system backend
- **packages/agent** — the assistant: LLM providers, MCP client, request and draft loops

## Commands

### Root (all workspaces)
```bash
npm install           # Install all workspace dependencies
npm run build         # Build shared packages, then core, CLI and server (no desktop installer)
npm test              # Run tests across all workspaces (Vitest)
```

### Core engine
```bash
npm -w apps/core run build    # Compile TypeScript → dist/ (uses tsc-alias for path aliases)
npm -w apps/core run dev      # Build and run core engine
npm -w apps/core run server   # Run the embedded server (Server.ts entry)
npm -w apps/core run lint     # ESLint with TypeScript rules
npm -w apps/core run format   # Prettier formatting
```

### Desktop app
```bash
npm -w apps/desktop run dev      # Electron dev mode (Vite picks a free port, from 5173; 3344 under the VS Code debugger)
npm -w apps/desktop run build    # TypeScript check + Vite build + Electron builder
npm -w apps/desktop run preview  # Preview the built Electron app
```

### Docs site
```bash
npm -w apps/docs run dev        # http://localhost:5173
npm -w apps/docs run generate   # regenerate actions/*.md from action JSDoc + schemas
```

### CLI
```bash
npm -w apps/cli run build   # Compile CLI to dist/
npm link                    # (inside apps/cli) Install `tipeline` CLI globally
```

## Architecture

### Core Engine (apps/core)

The core is an ES module Node.js application. Key subsystems:

- **Action system** (`src/action/`) — `ActionRegistry` maps action type strings to classes; `ActionFactory` instantiates them from config. Each action lives in its own directory under `src/action/actions/` (30+ types: browser, file, email, ssh, ocr, pdf, http, script, database, etc.).
- **Task orchestration** (`src/task/`) — `TaskFactory` loads YAML or JSON task definitions; `Task` manages variable substitution and action execution order.
- **Pipeline** (`src/pipeline/`) — Tracks execution state (actions, variables, blocks) for a running task. Models backed by `PipelineService` (Knex + Objection ORM).
- **Database** (`src/database/`) — SQLite via `better-sqlite3`, stored at `~/.tipeline/.database/tipeline.db`. ORM models: Task, Pipeline, PipelineAction, PipelineBlock, PipelineVariable, GlobalVariable, App. Migrations live in `/migrations`.
- **Engine** (`src/engine/`) — `Core.ts` is the main API (run/exec/list); `Server.ts` is the embedded HTTP server; `IpcTaskListener.ts` handles incoming IPC messages from CLI and Desktop.

Path aliases in `apps/core` (defined in tsconfig, resolved by `tsc-alias` on build):
`@/*`, `@step/*`, `@variable/*`, `@pipeline/*`, `@action/*`, `@task/*`, `@engine/*`, `@utils/*`, `@database/*`, `@validation/*`

### Desktop App (apps/desktop)

Vue 3 + Electron app. The renderer is a SPA; the Electron main process bridges IPC.

- **State** (`src/store/`) — Pinia: `useBuilderStore` manages the task/app builder (identifier, source JSON, selected components); `message` and `stream` stores handle IPC results.
- **Routing** (`src/router/`) — Vue Router v4 with lazy-loaded pages: Home, Tasks, Apps, Variables, Schedules, Settings, Notifications, Explore.
- **UI** — Reka UI component library, Tailwind CSS, Lucide icons, TanStack Vue Table, Chart.js, Gridstack, @unovis/vue.
- **Forms** — vee-validate + `@vee-validate/zod` for Zod schema-backed form validation.
- **Code editing** — CodeMirror via `vue-codemirror`.
- **Electron main** (`electron/main/index.ts`) — Window management, IPC bridge to core.
- **Preload** (`electron/preload/index.ts`) — Exposes contextBridge APIs to renderer.

### CLI (apps/cli)

- `CommandService.ts` — All command implementations (task, pipeline, schedule, service control)
- `IpcMessageService.ts` — Sends/receives IPC messages to/from the core service
- `Printer.ts` — Formatted output using cli-table3 and chalk

### IPC Communication

CLI and Desktop both communicate with Core via `node-ipc`. The Desktop additionally uses Electron IPC between the renderer and the main process, which then forwards to the Core service.

### Shared Packages

`@tipeline/schemas` exports the Zod action schemas and the full action registry. When adding a new action type, register it in both `packages/schemas/src/index.ts` and `apps/core/src/action/ActionRegistry.ts`.

## Code Style

- **Formatting:** Prettier — `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "es5"`, `printWidth: 100`
- **ES modules** throughout (`"type": "module"` in all package.json files)
- **Node 24** required (`.nvmrc`)
- TypeScript with strict path aliases; always use `@/` imports in each app rather than relative paths that cross directory boundaries.

# Developer Setup

This guide is for contributors and developers who want to build Tipeline from source, add new actions, or modify the engine.

## Requirements

- **Node.js 24** (see `.nvmrc` — use `nvm use` to switch automatically)
- **npm** — only needed to compile and build; not required to run Tipeline once built

Some features use tools from your system. Install the ones you plan to use:

| Tool | Needed for |
|------|-----------|
| Chrome or Chromium | Browser actions. Tipeline finds an installed copy, or set `chromePath` on `browser.launch` |
| ffmpeg (with `ffprobe`) | Audio and video actions |
| PostgreSQL | [Tipeline Server](/server/) only |
| Redis | The optional [BullMQ job runner](/internals/job-runners) only |

## Clone and Install

```bash
git clone https://github.com/tipeline/tipeline.git
cd tipeline
npm install
```

This installs dependencies for every workspace (`apps/*` and `packages/*`) in one step.

## Build All Packages

`npm install` already builds the shared packages. To build them again, then Core, the CLI and
the Server:

```bash
npm run build
```

This does not package the Desktop app. Use `npm -w apps/desktop run build` to make an installer.

Or build individually (shared packages must be built first):

```bash
# Shared packages
npm -w packages/types run build
npm -w packages/utils run build
npm -w packages/i18n run build
npm -w packages/schemas run build
npm -w packages/agent run build

# Applications
npm -w apps/core run build
npm -w apps/cli run build
npm -w apps/server run build
npm -w apps/desktop run build
```

## Running in Development

### Core Engine

```bash
npm -w apps/core run dev
```

Builds and starts the Core engine. Listens for IPC and WebSocket connections.

### Desktop App

```bash
npm -w apps/desktop run dev
```

Starts Vite (on port 5173, or the next free one; `http://127.0.0.1:3344` under the VS Code debugger) and launches the Electron shell with hot module replacement.

### Server

```bash
npm -w apps/server run dev
```

Needs PostgreSQL and a running Core on the same machine. See [Server → Bare metal](/server/bare-metal).

### Documentation site

```bash
npm -w apps/docs run dev        # http://localhost:5173, reloads on save
npm -w apps/docs run generate   # rebuild actions/*.md from the action code and schemas
npm -w apps/docs run build      # static site in apps/docs/.vitepress/dist
```

### CLI (link globally)

```bash
cd apps/cli
npm link
```

This installs the `tipeline` command globally, pointing at the locally built version. The first
time you use it, create the `~/.tipeline` folders and configuration, then start Core:

```bash
tipeline install
tipeline start
```

## Running Tests

```bash
npm test                      # every workspace
npm -w apps/core run test     # one workspace
```

Tests use Vitest.

## Database

The engine uses SQLite stored at `~/.tipeline/.database/tipeline.db`. The database and all tables are created automatically on first start via Knex migrations — no manual setup required.

## Environment Variables

Values already in Core's environment win. Otherwise a run loads, in order:

1. The workflow's own directory (`.env` next to the YAML file, when running a file)
2. `~/.tipeline/.env` (global fallback)

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TIPELINE_WS_PORT` | `4000` | WebSocket server port |
| `TIPELINE_MCP_PORT` | `4002` | MCP tool server port (assistant and AI clients) |
| `TIPELINE_IPC_SOCKET_ROOT` | node-ipc default | Folder for the IPC socket; Core and everything that connects to it must agree |
| `TIPELINE_ALLOW_PRIVATE_HTTP` | off | `true` lets `http` actions reach private and internal addresses |

Which job runner Core uses is set in `~/.tipeline/config.json`, not an environment variable.
See [Job Runners](/internals/job-runners).

## Project Structure

See [Architecture Overview → Repository Layout](/internals/overview#repository-layout).

## Adding a New Action

1. Create the handler in `apps/core/src/action/actions/<group>/` 
2. Register it in `apps/core/src/action/ActionRegistry.ts`
3. Add the Zod schema in `packages/schemas/src/` and export it from `packages/schemas/src/index.ts`
4. Write the JSDoc (description, `@returns`, `@example`) on the action — the
   [Actions reference](/actions/) is generated from it with `npm -w apps/docs run generate`

To add actions without touching Core, write a [plugin](/hub/plugins#writing-a-plugin) instead.

## Code Style

- **Prettier** — `tabWidth: 2`, `singleQuote: true`, `semi: true`, `trailingComma: "es5"`, `printWidth: 100`
- **ES modules** throughout (`"type": "module"` in all `package.json` files)
- Always use `@/` path aliases rather than relative paths that cross directory boundaries

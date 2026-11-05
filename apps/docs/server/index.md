# Tipeline Server

The **Tipeline Server** lets a team share one Core. It sits in front of a Core engine and
adds what a single local Core doesn't have: user accounts and roles, two-factor sign-in, API
tokens, webhooks, and an audit log. Source lives in `apps/server/`.

| Page | For |
|---|---|
| [Docker setup](/server/docker) | Running it with Docker Compose — first run, day-to-day ops, distributed workers, TLS, backups |
| [Bare-metal setup](/server/bare-metal) | Running it directly on Linux with systemd, no Docker |
| [API reference](/server/api) | Authentication, every REST endpoint and WebSocket command, rate limits |

## Connecting

- **Desktop app:** add the server as a workspace — **Manage workspaces…** in the sidebar's
  workspace switcher — and sign in. See [Workspaces](/desktop/settings#workspaces).
- **Scripts and CI:** create an API token in the workspace's **API Tokens** tab and call the
  [REST or WebSocket API](/server/api), or trigger a workflow with a webhook.
- **CLI:** `tipeline remote` connects to a Core's own WebSocket port with Core's token, not
  to the Server. See [CLI → Remote Connection Commands](/cli/commands#remote-connection-commands).

## Roles

| Role | Can |
|------|-----|
| **Viewer** | See workflows, apps and runs; open apps; decide approvals they're named on |
| **Editor** | Everything a viewer can, plus create, edit and run |
| **Admin** | Everything, plus manage users, webhooks and the cache, and see credentials |

### Who can see credentials

| | Viewer | Editor | Admin |
|---|---|---|---|
| Core's API token | No | No | Yes |
| Assistant API keys and tokens in Settings | No | No | Yes |
| Tokens for remote connections | No | No | Yes |
| Values of secret global variables | No, shown empty | Yes | Yes |
| Secret values typed into a workflow | No, shown empty | Yes | Yes |

::: warning Give the Editor role only to people you trust
An editor can write and run workflows, and a workflow can read secret variables and any file Core
can read, including Core's token. The roles above stop credentials being handed out, but they don't
stop an editor who sets out to get them. Viewers can't run or edit anything, so they can't do this.
:::

The [assistant](/assistant/) doesn't run in a Server workspace, so hiding these doesn't affect anyone's
assistant. It keeps using the keys on their own machine. Admins can still set the keys in Settings.

See [Roles & scopes](/server/api#_2-roles-scopes) for the exact permissions, and
[Who can approve on a server](/workflows/approvals#who-can-approve-on-a-server).

## The shape of it

```
CLI ──────┐                          ┌── Postgres (users, tokens, webhooks, audit log)
          │ IPC (local only)         │
Desktop ──┼── Core engine ───────────┤
          │   (runs tasks)           │
API/WS ───┘                          └── forwards WS commands to Core via IPC
clients
```

- **Core** doesn't know about users, roles, or tokens — it just runs tasks. It's reachable locally via IPC (CLI, Desktop) or, if you start it with `TIPELINE_BIND_HOST`, directly from other machines over its own WebSocket port with its single shared token (`apps/core/src/engine/Server.ts`). That's a separate, simpler mechanism from everything described here.
- **Server** sits in front of Core for remote/multi-user access: it owns its own Postgres database (accounts, roles, API tokens, webhooks, audit log), and forwards task-execution commands through to Core over the shared IPC socket.

## Design decisions worth knowing before you extend this

- **No generic "run task by id" REST endpoint, and that's deliberate.** Webhooks already solve "let something external trigger this specific task" — the webhook token is pre-wired to one task and doubles as the credential. A generic trigger-by-id endpoint would only earn its place if something needs *one* credential to dynamically pick *which* task to run at call time (a bot command, a dashboard with a task picker) — nothing in this codebase needs that yet, so it hasn't been built. If that need shows up, it also needs a `GET /tasks` discovery endpoint alongside it, since the caller wouldn't know task identifiers up front the way a webhook's creator does.
- **Sessions and API tokens are the same underlying mechanism, split by `kind`.** A session (`kind: "session"`) is created by `/auth/login` for a human in the Desktop app; an API token (`kind: "api"`) is created manually for a script/CI/integration. Sessions can be revoked but not rotated — rotating the token you're actively authenticated with would silently log you out.
- **Migrations are append-only.** Knex tracks which migration files have run by filename, not content — editing an already-applied migration does nothing on a database that already ran it. Every schema change after the fact needs a new migration file.

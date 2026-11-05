# Tipeline Server — API Reference

The server exposes two separate APIs on the same port (`4001` by default):

- **REST (HTTP)** — session/user management, API tokens, webhooks, audit log, run history.
- **WebSocket** — everything that talks to the Core engine itself: listing and running tasks, pipelines, variables, schedules, hubs, etc.

They share one authentication mechanism (a bearer token), but you'll use them for different things — see [Which one do I need?](#which-one-do-i-need) below.

> This is a different system from the CLI's `remote add <name> <host> <token>` command, which connects straight to **Core's own** WebSocket port using Core's own single static token — it never talks to this server at all. If you're scripting against the CLI, that token has nothing to do with anything on this page.

## Contents

1. [Authentication](#_1-authentication)
2. [Roles & scopes](#_2-roles-scopes)
3. [REST endpoints](#_3-rest-endpoints)
4. [WebSocket gateway](#_4-websocket-gateway)
5. [Rate limits & request limits](#_5-rate-limits-request-limits)
6. [Which one do I need?](#which-one-do-i-need)

---

## 1. Authentication

Every request (REST or WebSocket) authenticates the same way: an `Authorization: Bearer <token>` header. There are two kinds of token, and they're created differently:

| | Session token | API token |
|---|---|---|
| Created by | `POST /auth/login` (+ `/auth/login/mfa` if MFA is on) | A human, manually, in the Desktop app's **API Tokens** tab (or `POST /tokens` directly) |
| Who/what uses it | A person using the Desktop app | A script, CI pipeline, or other non-interactive caller |
| Expiry | Never, unless you set one | Whatever you chose at creation (30/90/180 days, or never) |
| Rotatable | No — sign in again instead | Yes (`POST /tokens/:id/rotate`) |
| Revocable | Yes — shows up in the **Sessions** tab | Yes — shows up in the **API Tokens** tab |

### Logging in

```bash
curl -s -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"changeme"}'
```

Two possible responses:

```jsonc
{ "token": "a1b2c3..." }                          // MFA not enabled — you're done
{ "mfaRequired": true, "challengeId": "f09e..." }   // MFA enabled — one more step
```

If you got `mfaRequired`, submit the 6-digit code from the authenticator app:

```bash
curl -s -X POST http://localhost:4001/auth/login/mfa \
  -H "Content-Type: application/json" \
  -d '{"challengeId":"f09e...","code":"123456"}'
# → { "token": "a1b2c3..." }
```

Use that token on every subsequent request: `-H "Authorization: Bearer $TOKEN"`.

### Creating an API token (for scripts/CI)

Requires an existing session token (bootstrap once, by hand or via the Desktop app):

```bash
curl -s -X POST http://localhost:4001/tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -d '{"name":"nightly-etl-runner","scope":"editor","expiresIn":"90d"}'
# → { "token": "f9e8d7...", "id": "...", "scope": "editor", "kind": "api", ... }
```

**Copy `token` now — it's only ever returned once**, at creation or rotation. The server stores only its SHA-256 hash and can't recover the raw value.

---

## 2. Roles & scopes

Three roles, each a strict superset of the next (defined in `apps/server/src/auth/Permissions.ts`):

| Role | Can do |
|---|---|
| `admin` | Everything below, plus manage members, tokens (anyone's), webhooks, security settings, view the audit log, and read credentials ([who can see what](/server/#who-can-see-credentials)) |
| `editor` | View, run, and edit tasks; manage their own tokens |
| `viewer` | View tasks only; manage their own tokens |

A user's role is set on their account (`/users`). An **API token's scope** is set at creation and can never exceed the creating user's own role — an `editor` can mint a `viewer`-scoped token for a read-only integration, but not an `admin`-scoped one.

Scope is enforced identically for REST and WebSocket: a `viewer`-scoped token gets `403`/`Permission denied` on anything beyond read-only calls (see [§4](#_4-websocket-gateway) for the exact list over WS).

---

## 3. REST endpoints

All bodies/responses are JSON. All require `Authorization: Bearer <token>` except where noted.

### Auth & sessions

| Method & path | Auth | Notes |
|---|---|---|
| `POST /auth/login` | — | `{email, password}` → `{token}` or `{mfaRequired, challengeId}` |
| `POST /auth/login/mfa` | — | `{challengeId, code}` → `{token}` |
| `GET /auth/me` | any | Returns the calling user's own record |
| `GET /auth/mfa/status` | any | `{enabled: boolean}` for the calling user |
| `GET /auth/mfa/enrollment` | admin | `{enabled, total}` — workspace-wide MFA adoption |
| `POST /auth/mfa/enroll` | any | Starts enrollment → `{secret, otpauthUrl}` |
| `POST /auth/mfa/confirm` | any | `{code}` → `{backupCodes: string[]}`, shown once |
| `POST /auth/mfa/disable` | any | Disables MFA on the calling user's own account |

### API tokens (`/tokens`)

| Method & path | Auth | Notes |
|---|---|---|
| `GET /tokens` | any | Own tokens, or everyone's if admin. Includes session tokens too (`kind: "session"` vs `"api"`) |
| `POST /tokens` | any | `{name, scope?, expiresIn?: "30d"\|"90d"\|"180d"\|null}` → always creates `kind: "api"` |
| `POST /tokens/:id/rotate` | owner or admin | New secret, same record. **Rejected for session tokens** — sign in again instead |
| `POST /tokens/:id/revoke` | owner or admin | Revoking your own current session signs you out immediately |
| `DELETE /tokens/:id` | owner or admin | Same as revoke |

### Users (`/users`) — admin only

| Method & path | Notes |
|---|---|
| `GET /users` | List all users |
| `POST /users` | `{email, name, password, role?}` — `role` defaults to `editor`, must be `admin`\|`editor`\|`viewer` |
| `PATCH /users/:id` | `{name?, role?, is_active?}` — admins can't change their own role away from admin or deactivate themselves |
| `DELETE /users/:id` | Soft-deactivates (same as `PATCH {is_active: 0}`) |

### Webhooks (`/webhooks`) — management is admin only; triggering needs no auth

| Method & path | Auth | Notes |
|---|---|---|
| `GET /webhooks` | admin | List all |
| `POST /webhooks` | admin | `{name, task_identifier, method?, variables_mapping?}` → `{webhook, token}` (token shown once) |
| `GET /webhooks/:id` | admin | |
| `PATCH /webhooks/:id` | admin | `{name?, task_identifier?, method?, enabled?, variables_mapping?}` |
| `DELETE /webhooks/:id` | admin | Hard delete |
| `POST /webhooks/:id/rotate` | admin | New secret → `{webhook, token}` |
| `POST /webhooks/trigger/:token` | **none** — the 64-hex token in the URL *is* the credential | Runs the mapped task. Request body → `variables.payload`; `variables_mapping` pulls specific fields out by path (e.g. `"userId": "body.user.id"`); query params → `variables.query`. Returns `202` immediately — the task runs async |

Webhooks are the answer to "let an external system (GitHub, Stripe, a cron service) trigger one specific task" — see [§6](#which-one-do-i-need).

### Task ownership & run history

| Method & path | Auth | Notes |
|---|---|---|
| `GET /workflows/ownership` | any | All task ownership/visibility records |
| `PATCH /workflows/:identifier/visibility` | owner or admin | `{visibility: "shared"\|"private"}` |
| `GET /pipeline-audit?limit=&offset=` | any | Past task runs: `task_identifier`, `status` (`running`\|`completed`\|`error`), `triggered_by_type`, timestamps. `limit` capped at 500 |
| `GET /audit-log?limit=&offset=&action=` | admin | Security/admin activity: logins, token/user/webhook/session changes. Same pagination cap |

### Misc

| Method & path | Auth |
|---|---|
| `GET /health` | none (still rate-limited) |

---

## 4. WebSocket gateway

This is how you actually **run a task and watch it execute** — there's no REST equivalent, because streaming live progress (`onAction` per step) doesn't fit a single request/response.

**Connect**, with the bearer token on the upgrade request (validated once, at connect time — not re-checked per message):

```js
import WebSocket from 'ws';
const ws = new WebSocket('wss://your-server:4001', {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
```

**Send a command** — every message needs an `event` name and a `correlationId` you choose, so you can match the response:

```json
{ "event": "exec", "correlationId": "run-1", "payload": { "identifier": "nightly-etl", "variables": { "env": "prod" } } }
```

**Receive events** — same `correlationId` comes back, event name is `on` + the command, capitalized:

```json
{ "event": "onTaskStart", "correlationId": "run-1" }
{ "event": "onAction", "correlationId": "run-1", "data": { "identifier": "step-1" } }
{ "event": "onTaskEnd", "correlationId": "run-1" }
```
(`onTaskError` instead of `onTaskEnd` on failure.)

### Available commands

The full allowlist lives in `apps/server/src/ws/WsGateway.ts` (`ALLOWED_COMMANDS`, ~70 entries) — anything not on that list gets rejected with `{"event":"error","data":{"message":"Unknown command: ..."}}`. Grouped by area:

- **Tasks**: `taskList`, `taskDetail`, `taskNew`, `taskDuplicate`, `taskUpdateSource`, `taskUpdateMeta`, `taskValidate`, `taskInstall`, `taskExportAll`, `taskReload`, `taskUninstall`, `taskUploadImage`
- **Execution**: `exec`, `debugNext`, `debugRun`, `debugPause`, `debugStop`
- **Pipelines**: `pipelineList`, `pipelineDetail`, `pipelineStats`, `pipelineResume`, `pipelineClear`, `pipelineClearAll`
- **Apps, Variables, Tags, Schedules, Plugins, Projects, Hubs, Connections**: full CRUD per area (see source for exact names)
- **System**: `status`, `stop`
- **Agent**: `agentPrompt`, `agentRunList`, `agentRunSetPipeline`

### Viewer-scoped tokens

A `viewer`-scoped connection can only call the read-only subset: `taskList`, `taskDetail`, `pipelineList`, `pipelineDetail`, `pipelineStats`, `appList`, `appDetail`, `tableDataFetch`, `variableList`, `variableUsage`, `tagList`, `scheduleList`, `status`, `settingsList`, `settingsGetApiToken`, `pluginList`, `pluginDetail`, `pluginUsage`, `projectList`, `projectDetail`, `agentRunList`, `connectionList`, `connectionGetActive`, `hubList`, `hubCatalog`. Everything else — including `exec` — gets `{"event":"error","data":{"message":"Permission denied: viewers cannot run \"...\""}}`.

Task-mutating commands (`taskUpdateSource`, `taskUpdateMeta`, `taskUninstall`, `taskReload`) are additionally gated by **task ownership**: a non-admin gets rejected if someone else owns that specific task, whether it's shared or private.

`taskDetail`, `exec`, `taskValidate`, `taskDuplicate`, and `taskUploadImage` are additionally gated by **visibility**: a non-owner, non-admin calling any of these on a task someone else has marked `private` gets a generic `Task not found` — not a permission error, so probing identifiers can't confirm a private task exists or who owns it. A *shared* task someone else owns can still be viewed/run by anyone (just not edited/reloaded/uninstalled).

---

## 5. Rate limits & request limits

| Limit | Value | Configurable via |
|---|---|---|
| General requests | 100/min per IP | `TIPELINE_RATE_LIMIT_MAX`, `TIPELINE_RATE_LIMIT_WINDOW_MS` |
| `/auth/login`, `/auth/login/mfa` | 10/min per IP | fixed |
| Request body size | 1 MB | `TIPELINE_MAX_BODY_BYTES` |
| `/pipeline-audit`, `/audit-log` page size | 500 max | fixed (`limit` query param, defaults to 100) |

Exceeding a rate limit returns `429` with a `Retry-After` header.

---

## Which one do I need?

- **Building a UI or a tool a human watches live?** WebSocket — you want the streamed `onAction` progress.
- **Want one specific external system (GitHub, Stripe, a cron host) to kick off one specific task when something happens over there?** A webhook — no token management on their end, the URL itself is the credential, and it's already wired to one task.
- **Want a script/CI job to run a task on a schedule and check later whether it succeeded, without maintaining a live connection?** An API token: WS to trigger (`exec`), then plain `GET /pipeline-audit` later to check status.
- **Want a single credential to dynamically pick *which* task to run at call time** (a bot command, a dashboard)? Nothing built for this yet — see the design notes on the [Server overview](/server/#design-decisions-worth-knowing-before-you-extend-this). Webhooks and scoped API tokens cover every need we've actually had so far; this would be new surface, not something that already exists under a different name.

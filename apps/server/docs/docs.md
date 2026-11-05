> User-facing server docs live on the docs site: `apps/docs/server/`. This file is the developer's scratch list.

## ENV VARS

### `TIPELINE_MAX_BODY_BYTES`
- **Default:** `1048576` (1 MB)
- **Description:** Max request body size

### `TIPELINE_RATE_LIMIT_WINDOW_MS`
- **Default:** `60000` (1 min)
- **Description:** Rolling window for both limiters

### `TIPELINE_RATE_LIMIT_MAX`
- **Default:** `100`
- **Description:** General limit per window per IP
- **Note:** Login is always capped at 10 per window regardless of this value

### `TIPELINE_SERVER_PORT`
- **Default:** `4001`
- **Description:** HTTP port the server listens on

### `TIPELINE_ADMIN_EMAIL`
- **Default:** (unset)
- **Description:** Email for the bootstrap admin user. If set together with `TIPELINE_ADMIN_PASSWORD` and no users exist yet, an admin account is created on startup. If users already exist, the account with this email is promoted to admin role.

### `TIPELINE_ADMIN_PASSWORD`
- **Default:** (unset)
- **Description:** Password for the bootstrap admin user (paired with `TIPELINE_ADMIN_EMAIL`). Unused if `TIPELINE_ADMIN_EMAIL` is not set.

### `TIPELINE_DB_CLIENT`, `TIPELINE_DB_HOST`, `TIPELINE_DB_PORT`, `TIPELINE_DB_NAME`, `TIPELINE_DB_USER`, `TIPELINE_DB_PASSWORD`, `TIPELINE_DB_SSL`
- **Description:** PostgreSQL connection (`apps/server/src/db/DatabaseManager.ts`). Postgres is required; there's no SQLite fallback.

### `TIPELINE_TRUST_PROXY`
- **Default:** `0`
- **Description:** How many reverse proxies in front of the server to trust in `X-Forwarded-For` when finding the client IP for rate limiting. `0` ignores the header and uses the socket address. Set it only to the number of proxies you control.

### `TIPELINE_IPC_SOCKET_ROOT`
- **Default:** (unset = node-ipc default, typically `/tmp`)
- **Description:** Overrides the socket root directory node-ipc uses when connecting to the `tipeline_core` service. Only needed when the core engine is configured with a non-default socket root.

---

## Current Features

- **Auth:** Users, scrypt password hashing, bearer tokens (SHA-256 hashed), revocation, expiry
- **Roles:** admin / editor / viewer, API token scopes, MFA
- **Task ownership:** Claim on create, shared/private visibility, non-owners blocked from editing
- **Audit log:** Pipeline runs tracked with who triggered them (user/webhook/schedule), status, timestamps
- **Webhooks:** Full CRUD, token rotation, variable mapping
- **WS gateway:** Auth on connect, ownership checks on mutating events, audit side-effects
- **Desktop UI:** User management page, connection store with serverMe + ownership map, role-aware `isOwner()` helper

---

## TODO

- SSO/OIDC — enterprise gate #1
- Secrets encryption at rest — often a procurement requirement
- Structured logging + Prometheus metrics — ops baseline
- Organizations / multi-tenancy — enables SaaS model
- SCIM — enterprise IdP automation
- SOC 2 audit prep (MFA, lockout, retention) — compliance certification

---

## Done

- Rate limiting + body size limits — security baseline
- Roles (viewer/editor/admin), token scopes + API token UI, PostgreSQL, MFA

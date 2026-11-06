# Tipeline Server — Docker Setup

Running Core + Server with Docker Compose, from a fresh clone to a working remote workspace you can connect the Desktop app to.

## Contents

1. [Prerequisites](#_1-prerequisites)
2. [Environment variables](#_2-environment-variables)
3. [First run](#_3-first-run)
4. [Day-to-day operations](#_4-day-to-day-operations)
5. [Connect the Desktop app](#_5-connect-the-desktop-app)
6. [Smoke-test the APIs](#_6-smoke-test-the-apis)
7. [Distributed workers (BullMQ)](#_7-distributed-workers-bullmq)
8. [Production: Nginx + TLS](#_8-production-nginx-tls)
9. [Backups](#_9-backups)

For what each endpoint actually does, see [API reference](/server/api) — this page is just getting the stack running.

---

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose version` → 2.x+)
- A PostgreSQL 15+ instance — the compose file below includes one. The server has **no SQLite/file-based fallback**; it always connects to Postgres via `TIPELINE_DB_*` env vars (`apps/server/src/db/DatabaseManager.ts`).

---

## 2. Environment variables

Create `apps/server/resources/.env` (gitignored — never commit real credentials here):

```env
# Seeds the first admin user on first boot. Required — without these, no admin
# account exists and you can't log in at all.
TIPELINE_ADMIN_EMAIL=admin@yourdomain.com
TIPELINE_ADMIN_PASSWORD=a-strong-password

TIPELINE_SERVER_PORT=4001
TIPELINE_MAX_BODY_BYTES=1048576
TIPELINE_RATE_LIMIT_WINDOW_MS=60000
TIPELINE_RATE_LIMIT_MAX=100

TIPELINE_DB_CLIENT=pg
TIPELINE_DB_HOST=postgres
TIPELINE_DB_PORT=5432
TIPELINE_DB_NAME=tipeline_server
TIPELINE_DB_USER=tipeline
TIPELINE_DB_PASSWORD=tipeline
TIPELINE_DB_SSL=false
```

| Variable | Default | Description |
|---|---|---|
| `TIPELINE_ADMIN_EMAIL` | — | **Required** on first boot. Seeded admin email. |
| `TIPELINE_ADMIN_PASSWORD` | — | **Required** on first boot. Seeded admin password. |
| `TIPELINE_SERVER_PORT` | `4001` | Port for both the HTTP and WebSocket server (same port, same process). |
| `TIPELINE_MAX_BODY_BYTES` | `1048576` | Max request body size. |
| `TIPELINE_RATE_LIMIT_WINDOW_MS` / `TIPELINE_RATE_LIMIT_MAX` | `60000` / `100` | General rate limit. Login is hard-capped at 10/min regardless. |
| `TIPELINE_IPC_SOCKET_ROOT` | `/tmp/` | Shared volume path for the socket between Server and Core. |
| `TIPELINE_DB_CLIENT` | `pg` | Knex client — `pg`, `mysql2`, etc. |
| `TIPELINE_DB_HOST` / `_PORT` / `_NAME` / `_USER` / `_PASSWORD` / `_SSL` | see compose file | Postgres connection. Use the compose service name (`postgres`) for `_HOST` inside Docker. |

---

## 3. First run

```bash
# From the monorepo root
docker compose -f apps/server/resources/docker-compose.yml up -d --build
```

This builds and starts three containers in order (Postgres → Core → Server, via healthcheck):

```bash
docker compose -f apps/server/resources/docker-compose.yml ps
# all three should show "running" or "healthy"
```

On first boot, `docker compose -f apps/server/resources/docker-compose.yml logs -f server` should show:

```
[Server] Admin user created: admin@yourdomain.com
[Server] Listening on port 4001
[WsGateway] Client connected: ...        (once something connects)
```

---

## 4. Day-to-day operations

```bash
# Rebuild after source changes (required — see note below)
docker compose -f apps/server/resources/docker-compose.yml up -d --build server

# Logs
docker compose -f apps/server/resources/docker-compose.yml logs -f server core

# Stop (data preserved)
docker compose -f apps/server/resources/docker-compose.yml down

# Stop and wipe all data (users, tokens, webhooks, audit log, Core state)
docker compose -f apps/server/resources/docker-compose.yml down -v
```

> **Migrations run automatically on server boot** (`ServerApp.start()` calls `runMigrations()` first thing) — no manual migration step. But Knex tracks *which migration files have run* by filename, not by content: once a migration has been applied, editing that same file later does nothing on a database that already ran it. New schema changes always need a new migration file.

---

## 5. Connect the Desktop app

1. Open Tipeline Desktop → **Manage workspaces…** in the sidebar's workspace switcher → **Add**
2. Host: `ws://localhost:4001` (or `wss://` behind TLS — see [§8](#_8-production-nginx-tls))
3. Log in with the admin credentials from your `.env`

---

## 6. Smoke-test the APIs

Full endpoint behavior is in [API reference](/server/api); here's just enough to confirm the stack is alive.

```bash
curl http://localhost:4001/health
# → {"ok":true}

TOKEN=$(curl -s -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"a-strong-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl http://localhost:4001/auth/me -H "Authorization: Bearer $TOKEN"
```

WebSocket (needs `wscat`: `npm install -g wscat`):

```bash
wscat -c ws://localhost:4001 -H "Authorization: Bearer $TOKEN"
> {"event":"taskList","correlationId":"t1","payload":{}}
```

---

## 7. Distributed workers (BullMQ)

By default Core runs tasks locally with Bree (worker threads). To distribute execution across separate Docker workers instead:

**Configure Core as orchestrator-only** — edit `~/.tipeline/config.json` on the host:

```json
{ "runner": "bullmq", "redis": "redis://redis:6379", "concurrency": 0 }
```

`concurrency: 0` means this Core publishes jobs to Redis but never processes them itself.

```bash
cd docker/distributed
docker compose build
docker compose up -d
docker compose logs -f worker-1 worker-2
```

Flow: CLI/Desktop/API → local Core (orchestrator) → Redis queue → a worker container picks it up, executes, reports progress back through Redis → QueueEvents → Core's own event bus → out to whoever's listening (CLI, Desktop, or a WS client on this server).

---

## 8. Production: Nginx + TLS

```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo certbot --nginx -d yourdomain.com
sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw allow 22 && sudo ufw enable
# then close 4001 to the outside — traffic should only arrive via 443
```

---

## 9. Backups

| Volume | Contents |
|---|---|
| `tipeline-data` | Core's database and task files |
| `postgres-data` | Server DB — users, tokens, webhooks, audit log |
| `ipc-socket` | Ephemeral — don't back this up |

```bash
# Postgres dump, e.g. in a daily cron
docker compose -f apps/server/resources/docker-compose.yml exec -T postgres \
  pg_dump -U tipeline tipeline_server > /backups/server-$(date +%F).sql
```

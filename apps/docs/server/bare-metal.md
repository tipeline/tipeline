# Tipeline Server — Bare-Metal Linux Deployment

Running the stack directly on Linux (Ubuntu 22.04+) with **systemd**, no Docker.

Two long-running Node.js processes talk to each other over a Unix socket:

- **tipeline-core** — task execution engine
- **tipeline-server** — HTTP/WebSocket API, backed by PostgreSQL via Knex (see [Docker setup](/server/docker#_1-prerequisites) — there's no SQLite/file-based fallback; Postgres is required in every environment, including local dev)

---

## 1. Install Node.js 24

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v24.x.x
```

## 2. Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

sudo -u postgres psql <<'SQL'
CREATE USER tipeline WITH PASSWORD 'a-strong-db-password';
CREATE DATABASE tipeline_server OWNER tipeline;
SQL
```

## 3. Create a dedicated system user

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tipeline
```

## 4. Deploy the code

```bash
sudo mkdir -p /opt/tipeline
sudo git clone <your-repo-url> /opt/tipeline
sudo chown -R tipeline:tipeline /opt/tipeline
```

## 5. Install dependencies and build

```bash
cd /opt/tipeline
sudo -u tipeline npm install
sudo -u tipeline npm run build
```

Compiles the shared packages in dependency order, then `apps/core`, `apps/cli` and `apps/server`.

## 6. Create data directories

```bash
sudo mkdir -p /var/lib/tipeline /tmp/tipeline
sudo chown tipeline:tipeline /var/lib/tipeline /tmp/tipeline
```

- `/var/lib/tipeline` — Core's persistent SQLite database (Core itself still uses SQLite locally; only the *server*'s data lives in Postgres)
- `/tmp/tipeline` — IPC socket, ephemeral, recreated on boot

## 7. Create the environment file

```bash
sudo mkdir -p /etc/tipeline
sudo tee /etc/tipeline/server.env > /dev/null <<EOF
TIPELINE_IPC_SOCKET_ROOT=/tmp/tipeline/
TIPELINE_SERVER_PORT=4001
TIPELINE_DB_CLIENT=pg
TIPELINE_DB_HOST=127.0.0.1
TIPELINE_DB_PORT=5432
TIPELINE_DB_NAME=tipeline_server
TIPELINE_DB_USER=tipeline
TIPELINE_DB_PASSWORD=a-strong-db-password
TIPELINE_ADMIN_EMAIL=admin@yourdomain.com
TIPELINE_ADMIN_PASSWORD=a-strong-password
EOF
sudo chmod 600 /etc/tipeline/server.env
```

## 8. Create systemd service files

**Core** — `/etc/systemd/system/tipeline-core.service`:

```ini
[Unit]
Description=Tipeline Core Engine
After=network.target

[Service]
Type=simple
User=tipeline
WorkingDirectory=/opt/tipeline
Environment=TIPELINE_IPC_SOCKET_ROOT=/tmp/tipeline/
ExecStartPre=/bin/mkdir -p /tmp/tipeline
ExecStart=/usr/bin/node apps/core/dist/engine/Server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

**Server** — `/etc/systemd/system/tipeline-server.service`:

```ini
[Unit]
Description=Tipeline HTTP Server
After=tipeline-core.service postgresql.service
Requires=tipeline-core.service

[Service]
Type=simple
User=tipeline
WorkingDirectory=/opt/tipeline
EnvironmentFile=/etc/tipeline/server.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## 9. Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tipeline-core tipeline-server
sudo systemctl status tipeline-core tipeline-server
sudo journalctl -u tipeline-core -u tipeline-server -f
```

---

## Nginx + TLS

Same reverse-proxy config as the Docker setup — see [Docker setup §8](/server/docker#_8-production-nginx-tls). Install via `apt install -y nginx certbot python3-certbot-nginx` instead of a container.

---

## Deploying updates

```bash
cd /opt/tipeline
sudo -u tipeline git pull
sudo -u tipeline npm install
sudo -u tipeline npm run build
sudo systemctl restart tipeline-core tipeline-server
```

Migrations run automatically on `tipeline-server` startup. Remember: **editing an already-applied migration file does nothing** — a new schema change always needs a new migration file, since Knex tracks completion by filename, not content.

---

## Data locations

| Path | Contents |
|---|---|
| PostgreSQL `tipeline_server` | Users, tokens, webhooks, task ownership, audit log |
| `~/Tipeline/.database/tipeline.db` (as the `tipeline` user) | Core's own database and task state |
| `/tmp/tipeline/` | IPC socket — ephemeral |

### Backups

```bash
# /etc/cron.daily/tipeline-backup
#!/bin/bash
sudo -u postgres pg_dump tipeline_server > /backups/server-$(date +%F).sql
```

---

## Comparison with Docker

| | Docker | Bare metal |
|---|---|---|
| Process management | Restart policy | systemd |
| Isolation | Container filesystem | Dedicated system user |
| Updates | `docker compose up --build` | `git pull && npm run build && systemctl restart` |
| Logs | `docker compose logs` | `journalctl` |
| IPC socket | Shared volume | `/tmp/tipeline/` on the host |

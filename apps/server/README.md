# @tipeline/server

Multi-user gateway for [Tipeline](https://github.com/tipeline/tipeline): accounts, roles, API tokens, webhooks and an audit log, in front of one Tipeline Core.

## Install

Requires Node 24 or later, a Postgres database, and a Core running on the same machine.

```bash
npm i -g @tipeline/cli @tipeline/server
tipeline install
tipeline start

TIPELINE_DB_HOST=127.0.0.1 TIPELINE_DB_NAME=tipeline_server \
TIPELINE_DB_USER=tipeline TIPELINE_DB_PASSWORD=change-me \
tipeline-server
```

It listens on port 4001 (`TIPELINE_SERVER_PORT`) and sets up its database on start. See the [Server docs](https://github.com/tipeline/tipeline/tree/main/apps/docs/server) for the first account and running it as a service.

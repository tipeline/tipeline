# Installation

Tipeline is available as a **Desktop app** for building visually, and a **CLI** for the terminal. Both connect to the same Core engine. To share Tipeline with a team, run a [Tipeline Server](/server).

---

## Desktop App

The Desktop app is the easiest way to get started. It includes the Core engine.

### Download

Installers are coming soon. Until then, build the Desktop app from source with the
[Developer Setup](/internals/setup) guide. It starts the Core engine for you.

### Optional tools

Most actions work right away. Two groups use tools from your system, so install them if your workflows need them:

| Tool | Needed for |
|------|-----------|
| Chrome or Chromium | Browser actions |
| ffmpeg (with `ffprobe`) | Audio and video actions |

---

## CLI

Install it with npm. It needs Node 24 or later and includes the Core engine:

```bash
npm i -g @tipeline/cli --allow-scripts=better-sqlite3
```

Then start Core and run workflows from your terminal:

```bash
tipeline start
tipeline workflow run my-workflow.yaml
```

To keep Core running on a server, as a system service or in Docker, see
[Run on a Server](/cli/server). To run Tipeline from source, see
[Developer Setup](/internals/setup).

---

## First Launch

The first time Core starts, from the Desktop or with `tipeline start`, it sets everything up
by itself:

| Created | What it is |
|---|---|
| `~/.tipeline/` | Tipeline's data folder |
| `.database/tipeline.db` | The database (SQLite), with every migration run |
| `.database/secret.key` | The key that encrypts secret values and stored credentials |
| `.database/core.token` | Core's API token, used by remote clients and AI tools |
| `logs/`, `plugins/` | Core's logs and installed plugins |

No setup step and no manual database setup is needed.

If `~/.tipeline` is already there, from an earlier install or from the Desktop and the CLI on
the same computer, Tipeline uses it as it is. Your workflows, runs and keys are kept. A database
from an older version is upgraded when Core starts. A database from a newer version isn't
opened: Core asks you to update Tipeline instead.

### Configuration files (optional)

Two more files can change Core's settings. Core doesn't need them: when a file isn't there,
Core uses its built-in defaults.

| File | What it sets | Default when it's missing |
|---|---|---|
| `~/.tipeline/database.json` | Where the database is | `~/.tipeline/.database/tipeline.db` |
| `~/.tipeline/config.json` | The [job runner](/internals/job-runners) | Worker threads, up to 10 runs at once |

Only create them to change something, such as keeping the database somewhere else or sharing
runs across machines with Redis. `tipeline install` writes both with the default values, ready
to edit, and creates the `~/.tipeline` folders. It doesn't create the database or the keys:
Core creates those the next time it starts, using the files you edited.

Core starts with neither file written on purpose. A written file keeps the defaults of the day
it was written, so if a later version of Tipeline changes a default, you'd keep the old value
without ever having chosen it. Without the files you always get the current defaults.

Core reads these files when it starts: restart it (`tipeline stop`, then `tipeline start`)
after editing them.

### Optional: Environment File

Most shared values belong in [global variables](/desktop/variables), which you set on the
**Variables** page. Use `~/.tipeline/.env` for values that belong to this computer, such as a
folder path or which server to use. It holds `NAME=value` lines that every workflow on the
computer can read:

```ini
REPORTS_DIR=/Volumes/Shared/reports
API_URL=https://staging.example.com
```

Reference them in any workflow with `{{ _env.API_URL }}`. In the Desktop, **Settings →
Environment** creates the file and opens it in your text editor. From a terminal, create it
yourself and keep it private with `chmod 600 ~/.tipeline/.env`.

The file is plain text. For passwords and API keys, a secret
[global variable](/workflows/variables#where-secret-values-are-kept) is safer, because Tipeline
keeps it encrypted. See [Global variables or the environment?](/workflows/variables#global-variables-or-the-environment).

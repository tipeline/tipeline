# Installation

Tipeline is available as a **Desktop app** for building visually, and a **CLI** for the terminal. Both connect to the same Core engine. To share Tipeline with a team, run a [Tipeline Server](/server/).

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

> **Coming soon** — the `tipeline` CLI package will be published to npm shortly.
>
> Once available, install it globally with:
> ```bash
> npm install -g @tipeline/cli
> ```
> Then start the Core engine and run workflows from your terminal:
> ```bash
> tipeline install   # first time only
> tipeline start
> tipeline workflow run my-workflow.yaml
> ```

In the meantime, see the [Developer Setup](/internals/setup) guide to run Tipeline from source.

---

## First Launch

The first time Tipeline starts, it automatically:

1. Creates the data directory at `~/.tipeline/`
2. Sets up the SQLite database (`~/.tipeline/.database/tipeline.db`)
3. Runs all database migrations
4. Creates Core's API token, used by remote clients and AI tools (saved in `~/.tipeline/.database/core.token`)

No manual database setup is needed.

### Optional: Global Environment File

Create a `.env` file at `~/.tipeline/.env` to define environment variables available across all workflows:

```ini
SMTP_HOST=smtp.gmail.com
API_KEY=your-key-here
```

Reference them in any workflow with `{{ _env.SMTP_HOST }}`. See [Variables & Templates](/workflows/variables#environment-files).

# CLI Commands

The Tipeline CLI (`apps/cli`) is built with **Commander.js** and communicates with the Core engine via IPC. Once linked, all commands are available as `tipeline <command>`.

## Installation

```bash
cd apps/cli
npm run build
npm link   # installs `tipeline` globally
```

## Service Control

### `tipeline install`
Create the `~/.tipeline` folders and configuration. `--force` overwrites an existing configuration.

```bash
tipeline install
```

### `tipeline start`
Start the Core engine as a background service. Only one Core runs at a time: if one is already
running, this says so and leaves it alone.

```bash
tipeline start
```

### `tipeline stop`
Gracefully shut down the Core on this machine, even when commands are going to a remote. It
finishes any run in progress first. `--remote` stops the active remote instead. `--force` kills
every Core process on this machine without asking it over IPC, for when Core doesn't respond.

```bash
tipeline stop
tipeline stop --remote
tipeline stop --force
```

### `tipeline service`
Start Core when you log in and, on macOS and Linux, again after a crash. The Desktop app turns this
on by default, and you can change it in **Settings → About**.

```bash
tipeline service install    # turn auto-start on
tipeline service uninstall  # turn it off; a running Core keeps running
tipeline service status
```

Auto-start belongs to whichever of the CLI and Desktop set it up. `tipeline service install`
takes it over from Desktop, and Desktop leaves it that way. If Desktop set it up, `tipeline start`
still runs the Core installed with the CLI.

On Linux it uses a systemd user service, which runs from login to logout. To keep Core running
without a login session, run `loginctl enable-linger`. After uninstalling the Desktop app on macOS,
delete `~/Library/LaunchAgents/com.tipeline.core.plist`, or run `tipeline service uninstall` first.

### `tipeline status`
Show which Core commands are going to, and whether it's running.

```bash
tipeline status
# connected to  this machine
# status        ● running
# pid           12345
# uptime        12113.42s
# cli           1.0.0
# core          1.0.0
```

## Workflow Commands

`tipeline task` (and `t`) still work as aliases of `tipeline workflow` (`w`), so existing scripts keep running.

### `tipeline workflow run <source>`
Execute a workflow directly from a YAML or JSON file, without installing it. Streams action results to the terminal.

```bash
tipeline workflow run my-workflow.yaml
tipeline workflow run my-workflow.yaml --verbose
tipeline workflow run my-workflow.yaml --var apiUrl=https://api.example.com --var debug=true
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full action params and results |
| `--var <key=value>` | Override a workflow variable (repeatable) |
| `--no-cache` | Run every step, without reading or writing cached results |
| `--refresh-cache` | Run every step and replace its cached result |

Steps whose result came from the cache are marked `cached` in the output. See [Caching Results](/workflows/caching).

`--var` names are checked: one the workflow doesn't have, or a private variable, is an error that
lists what it does take. `pipeline resume` may also correct private variables.

Identifiers that start with `-` work like any other.

`run`, `exec` and `pipeline resume` stay until the run ends, and exit with how it ended:

| Exit code | The run |
|---|---|
| `0` | Finished |
| `1` | Failed, or was canceled |
| `2` | Paused, waiting for an approval |

### `tipeline workflow exec <identifier>`
Execute a workflow that is already installed in the database by its identifier. Takes the same options as `run`.

```bash
tipeline workflow exec abc123def456ghi7890xy
tipeline workflow exec abc123def456ghi7890xy --var retryCount=5
tipeline workflow exec abc123def456ghi7890xy --refresh-cache
```

### `tipeline workflow list`
List all installed workflows.

```bash
tipeline workflow list
# ┌─────────────────────────┬──────────────────────┬─────────┐
# │ Identifier              │ Name                 │ Version │
# ├─────────────────────────┼──────────────────────┼─────────┤
# │ abc123def456ghi7890xy   │ Daily Report         │ 1.0.0   │
# │ xyz987uvw654rst3210ab   │ User Sync            │ 2.1.0   │
# └─────────────────────────┴──────────────────────┴─────────┘
```

### `tipeline workflow install <path>`
Import a YAML/JSON workflow file into the database.

```bash
tipeline workflow install ./workflows/my-workflow.yaml
```

### `tipeline workflow uninstall <identifier>`
Move a workflow to the Trash, with its schedules. It can be restored from the Desktop app for 30 days.

```bash
tipeline workflow uninstall abc123def456ghi7890xy
```

### `tipeline workflow validate <source>`
Check a workflow file without running it: its format, that every action exists, and each
step's settings. These are the checks installing and reloading make.

```bash
tipeline workflow validate my-workflow.yaml
# Workflow validated successfully
```

### `tipeline workflow info <identifier>`
Show an installed workflow's details: identifier, name, description (as formatted terminal text), author, version, tags, project, its number of steps and variables, and when it was created and updated.

### `tipeline workflow history <identifier>`
Show a workflow's past runs.

### `tipeline workflow export <identifier>`
Save an installed workflow's YAML to a file named after the workflow (`invoice-report.yml`) in the
current folder, or `--output <path>`. A folder as the output path gets the named file inside it.

```bash
tipeline workflow export abc123def456ghi7890xy --output ./backup/report.yml
```

Secret values stay out of the file. `--include-secrets` writes them, in plain text.

### `tipeline workflow export-all`
Save every installed workflow as YAML files in one zip —
`tipeline-workflows-export-<timestamp>.zip`, or `--output <path>`. Each file is named after its
workflow; two workflows with the same name get the start of their identifier added
(`invoice-report-a1b2c3.yml`).

### `tipeline workflow reload <identifier> <path>`
Update an installed workflow's source from a file.

```bash
tipeline workflow reload abc123def456ghi7890xy ./workflows/my-task-v2.yaml
```

## Pipeline Commands

### `tipeline pipeline list <taskIdentifier>`
Show execution history for a workflow.

```bash
tipeline pipeline list abc123def456ghi7890xy
# ┌────────────────────────┬─────────────┬──────────────────────┬──────────────────────┐
# │ Identifier             │ Status      │ Started              │ Finished             │
# ├────────────────────────┼─────────────┼──────────────────────┼──────────────────────┤
# │ pip001aaa222bbb333ccc  │ completed   │ 2025-05-24 09:00:00  │ 2025-05-24 09:01:23  │
# │ pip002ddd333eee444fff  │ failed      │ 2025-05-24 10:00:00  │ 2025-05-24 10:00:15  │
# └────────────────────────┴─────────────┴──────────────────────┴──────────────────────┘
```

### `tipeline pipeline info <pipelineIdentifier>`
Show one run: its workflow, every step with its status, start and finish times, and errors.

### `tipeline pipeline clear <taskIdentifier>`
Delete a workflow's runs. Runs still running are kept.

### `tipeline pipeline resume <pipelineIdentifier>`
Resume a failed pipeline from where it stopped.

```bash
tipeline pipeline resume pip002ddd333eee444fff
tipeline pipeline resume pip002ddd333eee444fff --var retryUrl=https://fallback.api.com
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show full action output |
| `--var <key=value>` | Override variables for this run |

### `tipeline pipeline cancel <pipelineIdentifier>`
Cancel a run. It ends right away as `canceled`, including the step running now. See
[Cancel a run](/desktop/pipelines#cancel-a-run).

```bash
tipeline pipeline cancel pip003ggg444hhh555iii
# Canceling run "pip003ggg444hhh555iii". It ends right away, including the step running now.
```

The run is recorded as canceled by `cli` (on a server workspace, by your account). A run
that had already ended is left alone.

### `tipeline pipeline retention [days]`
Show how long finished runs are kept, or set it: a number of days, or `off` to keep them forever. The
default is 90 days. See [How long runs are kept](/desktop/pipelines#how-long-runs-are-kept).

### `tipeline pipeline approvals`
List the runs waiting for an approval, with what each one asks.

### `tipeline pipeline approve <pipelineIdentifier>`
Approve a run waiting for an approval. The run carries on in the background. `--comment <text>`
keeps a reason with the decision.

### `tipeline pipeline reject <pipelineIdentifier>`
Reject a run waiting for an approval. It ends as `canceled`. Takes `--comment <text>` too.

```bash
tipeline workflow exec abc123def456ghi7890xy     # exits with code 2 when it pauses
tipeline pipeline approvals
tipeline pipeline approve pip003ggg444hhh555iii --comment "Numbers match the invoice"
```

## Cache Commands

Stored results of cached steps and workflows (see [Caching Results](/workflows/caching)).

### `tipeline cache list`
Lists cached results, newest first: what each is, its workflow, size, how often it was reused, and when it expires. `--workflow <identifier>` shows only that workflow's.

### `tipeline cache clear`
Deletes cached results. Say which: `--workflow <identifier>` for one workflow's, or `--all` for every one. On a Tipeline Server, only admins can clear the cache.

```bash
tipeline cache clear --workflow abc123def456ghi7890xy
tipeline cache clear --all
```

## Plugin Commands

Plugins run their own code on your machine, so one installed from a hub stays disabled until you
turn it on. Workflows that use a disabled plugin fail with a message naming it.

| Command | What it does |
|---------|--------------|
| `tipeline plugin list` | List installed plugins and whether each is enabled |
| `tipeline plugin enable <plugin>` | Turn a plugin on. No restart needed |
| `tipeline plugin disable <plugin>` | Turn a plugin off. Workflows that use it fail until it is on again |

`<plugin>` is its identifier, its group, or its name in the hub catalog.

## Schedule Commands

### `tipeline schedule list`
Show all scheduled workflows.

```bash
tipeline schedule list
# ┌──────────────────────┬──────────────────────┬──────────────────────────────────────┬────────────────────┐
# │ Schedule ID          │ Workflow             │ When                                 │ Next run           │
# ├──────────────────────┼──────────────────────┼──────────────────────────────────────┼────────────────────┤
# │ sch001aaa222bbb333cc │ Daily Report         │ At 09:00 (0 9 * * *)                 │ Fri, 23 Oct, 09:00 │
# │ sch002ddd444eee555ff │ Daily Report         │ Once, Sat, 24 Oct, 08:00             │ Sat, 24 Oct, 08:00 │
# │ sch003ggg666hhh777ii │ Random Numbers       │ Every 40 seconds                     │ Thu, 22 Oct, 10:15 │
# └──────────────────────┴──────────────────────┴──────────────────────────────────────┴────────────────────┘
```

A finished one-time schedule shows **done** under Next run; a paused one shows **paused**.

### `tipeline schedule set <workflowIdentifier>`
Schedule a workflow to run on its own. Say when in plain words with `--when`, or give a cron with `--cron`.

```bash
# Every day at 9am
tipeline schedule set abc123def456ghi7890xy --when "every day at 9am"

# Every 40 seconds (repeats from when it's created)
tipeline schedule set abc123def456ghi7890xy --when "every 40 seconds"

# Every 15 minutes during working hours
tipeline schedule set abc123def456ghi7890xy --when "every 15 minutes between 9 and 17 on weekdays"

# Once, tomorrow morning
tipeline schedule set abc123def456ghi7890xy --when "tomorrow at 8am"

# Every 20 seconds (6-field cron: seconds first)
tipeline schedule set abc123def456ghi7890xy --cron "*/20 * * * * *"
```

**Options** (give one):

| Option | Description |
|--------|-------------|
| `--when <words>` | Plain words, English or Spanish: see [Saying when](/desktop/schedules#saying-when) |
| `--cron <expression>` | 5 fields, or 6 with seconds first |

It's checked before anything is sent: a schedule closer than every 10 seconds, or a time that has passed, is refused with the reason.

### `tipeline schedule remove <scheduleIdentifier>`
Delete a schedule, by its identifier or its name.

```bash
tipeline schedule remove sch001aaa222bbb333ccc
```

## Project Commands

### `tipeline project delete <project>`
Delete a [project](/desktop/projects#deleting-a-project), by its name (any case) or identifier.
It shows what happens and asks first.

- By default its workflows and apps are kept, in no project.
- `--with-contents` also moves them to the Trash, except workflows that something outside
  the deletion still uses (an app or workflow in another project, or in none). Those are
  kept, and the list says what uses each one.
- `--include-used` (with `--with-contents`) deletes those too, and says what will stop
  working.
- `-y, --yes` deletes without asking. Without a terminal to ask in, it's required.

```bash
tipeline project delete Sales --with-contents
# Delete project "Sales"?
#   Moves to the Trash (restorable for 30 days):
#     workflow  Quote
#               1 schedule goes with it
#     app       Deals
#   Kept in no project, still used elsewhere (use --include-used to delete them too):
#     workflow  CRM lookup — used by Desk (Ops)
# Delete? [y/N]
```

On a Tipeline Server, only admins can delete projects.

## Hub Commands

Install and update workflows, apps and plugins from [hubs](/hub/).

| Command | What it does |
|---------|--------------|
| `tipeline hub list` | List the hubs you've added |
| `tipeline hub add <name> <type> <target>` | Add a hub, after checking the address is well formed (and that a folder exists). `type` is `remote` (target: a base URL) or `local_folder` (target: an absolute folder path). `--token <token>` adds an access token to a private remote hub (target can be a GitHub repo link) |
| `tipeline hub token <id> [token]` | Set a remote hub's access token, or remove it when no token is given |
| `tipeline hub remove <id>` | Remove a hub. Nothing installed from it is uninstalled |
| `tipeline hub enable <id>` / `disable <id>` | Turn a hub on or off |
| `tipeline hub catalog <id>` | List the workflows, apps and plugins a hub offers |
| `tipeline hub install <type> <hubId> <itemIdentifier>` | Install an item. `type` is `workflow` (or `task`), `app` or `plugin` |
| `tipeline hub check [id]` | Check one hub, or all enabled hubs, for updates now instead of waiting for the hourly check. Says what each one returned, and exits with `1` if any couldn't be reached |
| `tipeline hub updates` | List what needs you, such as a major version waiting for approval, and what was installed recently |
| `tipeline hub update <type> <identifier>` | Install the version a hub offers, including a waiting major version. `type` is `workflow` (or `task`), `app` or `plugin` |

```bash
tipeline hub add team local_folder /Volumes/shared/tipeline-hub
tipeline hub catalog 1
tipeline hub install workflow 1 hello-world
```

## Assistant Commands

### `tipeline assistant prompt <text>`
Also `tipeline agent prompt <text>`. Ask for something in plain language: the assistant finds
the workflow, asks for missing values and runs it once you confirm. Say how often and it
offers to create a schedule instead.

```bash
tipeline assistant prompt "give me the sales report for April"
tipeline assistant prompt "run the random numbers every 40 seconds"
tipeline assistant prompt --yes "deploy the website"
```

| Option | Description |
|--------|-------------|
| `-y, --yes` | Run, create the schedule, install from a hub, or draft without asking for confirmation. Still asks for missing values. |
| `-p, --project <name>` | Also follow this project's [assistant instructions](/assistant/instructions) (its name or identifier). |

See [Assistant in the Terminal](/assistant/cli) for scripts, exit codes and environment variables.

## Remote Connection Commands

The CLI can control a **remote** Core engine over its WebSocket port (`4000`), using the API
token saved in that machine's `~/.tipeline/.database/core.token`. That Core has to be started with
`TIPELINE_BIND_HOST` set, because it only accepts connections from its own machine by default (see
[Security](/guide/connect-other-tools#security)).

While a remote is active, every command goes to it and says so on stderr. If it can't be reached the
command fails and nothing runs on this machine. `start`, `stop` and `service` always mean this
machine (use `stop --remote` for the remote).

Files stay on your side. `workflow run`, `install`, `validate` and `reload` send the file's contents,
and `export` and `export-all` save the result on this machine. A workflow that runs sub-workflows from
files next to it (`path: ./child.yml`) can't be sent this way and is refused: install those on the
remote and call them by identifier. Paths inside a workflow's steps always mean the machine that runs it.

This talks to Core directly, with Core's single token. To work with a
[Tipeline Server](/server/) — user accounts, roles, audit — add it as a workspace in the Desktop app
(**Manage workspaces…** in the workspace switcher).

### `tipeline remote list`
List all configured remote connections, with `*` beside the active one.

### `tipeline remote add <name> <host> <token>`
Register a remote Core engine.

```bash
tipeline remote add production ws://192.168.1.10:4000 <core-api-token>
```

### `tipeline remote remove <id>`
Delete a remote connection.

### `tipeline remote use <name-or-id>`
Set the active connection, by name or ID. Subsequent CLI commands will route to this remote engine.

```bash
tipeline remote use production
# Switched to remote: production
tipeline workflow list   # lists tasks on the remote engine
```

To switch back to local:

```bash
tipeline remote use local
```

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Show help for any command |
| `--version` | Show CLI version |

## Cron Expression Reference

```
┌───────────── minute (0–59)
│ ┌───────────── hour (0–23)
│ │ ┌───────────── day of month (1–31)
│ │ │ ┌───────────── month (1–12)
│ │ │ │ ┌───────────── day of week (0–6, Sun=0)
│ │ │ │ │
* * * * *
```

| Expression | Meaning |
|------------|---------|
| `* * * * *` | Every minute |
| `0 * * * *` | Every hour |
| `0 9 * * *` | Every day at 9am |
| `0 9 * * 1` | Every Monday at 9am |
| `0 0 1 * *` | First day of every month |
| `*/15 * * * *` | Every 15 minutes |

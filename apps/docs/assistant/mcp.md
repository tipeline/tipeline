# Connect AI Tools (MCP)

Core has a built-in **MCP server**, so AI tools and bots — Claude Code, Claude Desktop, Cursor,
or your own agent — can find your workflows, run them, and draft new ones. The Desktop
[assistant](/assistant) uses this same server.

## Connection details

| | |
|---|---|
| Address | `http://127.0.0.1:4002/mcp` (change the port with `TIPELINE_MCP_PORT`) |
| Transport | Streamable HTTP |
| Auth | `Authorization: Bearer <token>` |
| Token | Core's API token, saved in `~/.tipeline/.database/core.token` |

Core must be running: the Desktop app starts it, or run `tipeline start`.

### Claude Code

```bash
claude mcp add --transport http --scope user tipeline http://127.0.0.1:4002/mcp \
  --header "Authorization: Bearer $(cat ~/.tipeline/.database/core.token)"
```

`--scope user` makes Tipeline available in every folder. Leave it out to add it only for the
folder you run the command in. The `claude` CLI and the Claude Code extension for VS Code share
this setting, so one command covers both. See [Using it in Claude Code](#using-it-in-claude-code).

The command copies the token in when you run it. If `core.token` changes, remove the server
(`claude mcp remove tipeline`) and add it again.

### Cursor and other clients with HTTP support

```json
{
  "mcpServers": {
    "tipeline": {
      "url": "http://127.0.0.1:4002/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Clients that only start local servers (Claude Desktop)

Bridge to the HTTP server with `mcp-remote`:

```json
{
  "mcpServers": {
    "tipeline": {
      "command": "npx",
      "args": ["mcp-remote", "http://127.0.0.1:4002/mcp",
               "--header", "Authorization: Bearer <token>"]
    }
  }
}
```

### claude.ai on the web

Connectors on claude.ai run in the cloud and can't reach `127.0.0.1`. To use one, Core has to be
reachable from the internet. Put the [Tipeline Server](/server) in front of it rather than
exposing Core and its token.

## Using it in Claude Code

1. Make sure Core is running: open the Desktop app, or run `tipeline start`.
2. Start a new session: run `claude` in a terminal, or open a new conversation in the VS Code
   panel. Sessions that were already open don't see a server you just added.
3. Type `/mcp` and check that `tipeline` shows as connected.

Then ask in plain words. There are no special commands; Claude picks the Tipeline tools itself:

- "What Tipeline workflows do I have?"
- "Find a Tipeline workflow that checks if a website is up and run it for example.com"
- "Run my Tipeline workflow *Daily report* with date = today"
- "Create a Tipeline draft workflow that reads a CSV from ~/Downloads and emails me the row
  count. Check it before saving."

Saying "Tipeline" helps, especially inside a code project, where Claude might otherwise answer
from the files around it.

- **Permissions.** The first time Claude uses each tool (such as `mcp__tipeline__exec_task`), it
  asks you. Choose "allow always" for tools you trust, like searching and listing; you may want
  to keep approving `exec_task` each time.
- **Runs show up in Desktop**, live and in the workflow's run history.
- **New workflows are drafts.** Open them in Desktop, test them, and click **Mark as ready**.

For a single question without the interactive session, use `claude -p`:

```bash
claude -p "list my Tipeline workflows"
```

In this mode Claude can't stop to ask for permission. To let it use the Tipeline tools, including
running workflows, add `--allowedTools "mcp__tipeline__*"`.

## MCP or a skill file?

Some teams write Claude skills from these docs so Claude knows how to list and create workflows.
A skill is written instructions: Claude reads it and then works from what the text says, usually
by running the CLI or writing YAML files. The MCP server lets Claude use the running Core instead.

| | Skill file | MCP server |
|---|---|---|
| Which workflows exist | Whatever the CLI prints, as text to parse | `search_workflows`: installed and hub workflows, with their inputs and outputs |
| Actions and plugins | What the docs describe; misses locally installed plugins, and goes stale when actions change | `list_actions` and `describe_actions` read what this Core actually has |
| Creating a workflow | Claude writes YAML; mistakes show only when it's installed or run | `check_workflow` checks it the way installing and running does |
| Untested workflows | Can be installed as ready and run right away | Saved as drafts that can't run until a person marks them ready |
| Running | `tipeline workflow exec --var` can set any variable, private ones included | Public and protected inputs; private and secret values never come back |
| Setup | Drop the files in; works wherever Claude has a shell | Core running, plus the token |

Skills are still useful for team conventions such as names, tags and style. The best of both: a
skill for your conventions that tells Claude to use the Tipeline MCP tools for everything else.

## Tools

| Tool | What it does |
|------|--------------|
| `search_workflows` | Finds workflows for a request — installed ones, and ones on your enabled hubs that aren't installed yet — with their public and protected inputs and, when they mark them, their outputs |
| `list_tasks` | Every installed workflow with its public and protected inputs. Drafts are marked `draft: true` |
| `exec_task` | Runs an installed workflow by identifier with optional variable values, waits for it, and returns `{ status, pipelineIdentifier, durationMs, outputs, outputDetails?, description?, error? }` |
| `authoring_guide` | How to write a workflow in YAML, with examples |
| `list_actions` | Every action group, built-in and plugin, with what each action does |
| `describe_actions` | The fields, return type and an example of named actions, e.g. `["http.request"]` |
| `check_workflow` | Checks workflow YAML the way installing and running it would; returns `{ valid, errors, warnings }` |
| `create_draft_workflow` | Saves workflow YAML as a [draft](/assistant#drafts) after checking it |

A typical bot asks `search_workflows` with the user's request, fills in the inputs, and calls
`exec_task`. To build something new: `authoring_guide` → `search_workflows` (to reuse
installed workflows as sub-workflow steps) → `list_actions` → `describe_actions` →
`check_workflow` → `create_draft_workflow`, then a person tests the draft and marks it ready.
`check_workflow` also checks sub-workflow steps against the workflows they call.

## What a client can and can't do

- **Runs show up everywhere.** A run started over MCP appears live in the Desktop app and the
  CLI, and in the workflow's run history, like any other run.
- **Callers see public and protected.** `exec_task` returns the final values of the workflow's
  non-secret [outputs](/workflows/files#outputs), public or protected — or, when it marks none,
  of all its public, non-secret variables. `outputDetails` gives each output's label and
  description (what the value means, such as its unit) and `description` the workflow's
  own, so a client can explain the result. Search results list public and protected inputs,
  plus the outputs a workflow marks. Private and secret variables are never shared.
- **Drafts never run.** `exec_task` refuses a draft, and search leaves drafts out. A person has
  to test it and click **Mark as ready**.
- **Hub workflows aren't installed by the client.** A search result with a `hub` field isn't
  installed yet; someone installs it (the Desktop assistant offers to) before it can run.
- **Approvals still apply.** A workflow with an approval step waits for a person to decide.

## Security

::: danger The token is full access
Core's API token is the same token its WebSocket port accepts. Anyone holding it can run any
installed workflow on that Core — with any variable values, including private ones (the same
as `--var` in the CLI) — and save drafts. Give it only to tools you trust, and keep
`core.token` private.
:::

- The MCP server only accepts connections from this machine. To reach it from others, set
  `TIPELINE_BIND_HOST` before Core starts, and block port `4002` with a firewall from anyone
  who doesn't need it.
- For several people, or when you need roles and an audit trail, put the
  [Tipeline Server](/server) in front of Core instead of sharing the Core token.
- If port `4002` is taken, Core starts without the MCP server and logs a warning; set
  `TIPELINE_MCP_PORT` to another port, and point your clients (and the assistant's **MCP
  connection** setting) at it.

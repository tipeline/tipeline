# Connect AI Tools (MCP)

Core has a built-in **MCP server**, so AI tools and bots — Claude Code, Claude Desktop, Cursor,
or your own agent — can find your workflows, run them, and draft new ones. The Desktop
[assistant](/assistant/) uses this same server.

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
claude mcp add --transport http tipeline http://127.0.0.1:4002/mcp \
  --header "Authorization: Bearer $(cat ~/.tipeline/.database/core.token)"
```

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
| `create_draft_workflow` | Saves workflow YAML as a [draft](/assistant/#drafts) after checking it |

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
  [Tipeline Server](/server/) in front of Core instead of sharing the Core token.
- If port `4002` is taken, Core starts without the MCP server and logs a warning; set
  `TIPELINE_MCP_PORT` to another port, and point your clients (and the assistant's **MCP
  connection** setting) at it.

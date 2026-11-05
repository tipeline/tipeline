# Connect Other Tools

Your own programs, scripts and other tools can run Tipeline workflows and pass them values.
There are four ways in:

| Way in | Best for | You get back |
|---|---|---|
| [CLI](#cli) | Shell scripts, cron jobs, quick automation | Printed progress and an exit code |
| [WebSocket](#websocket) | Programs in any language that need full control | Live progress for each step, then the final values |
| [MCP](#mcp) | AI tools and agents, or "run it and give me the result" | One answer with the run's status and outputs |
| [Tipeline Server](#tipeline-server) | Several people or outside systems, with their own tokens and roles | WebSocket (as above) or webhooks |

**Not sure? Use the WebSocket.** It works from any language and any machine, and it can do
everything Desktop can.

## Before you start

Everything except Tipeline Server talks straight to **Core**, the engine that runs your
workflows. Core has to be running: the Desktop app starts it, or run `tipeline start`.

You also need two things:

- **Core's token.** Core creates it the first time it starts, prints it every time it
  starts, and saves it here:

  ```bash
  cat ~/Tipeline/.database/core.token
  ```

- **The workflow's identifier**, such as `abc123def456ghi7890xy`. Find it on the workflow's
  Overview in Desktop, or list all of them:

  ```bash
  tipeline workflow list
  ```

The values you pass go into the workflow's variables by name. A workflow's inputs are its
public and protected variables (see [Variables](/workflows/variables)).

## CLI

For a script on the same machine, call the CLI. Use `--var name=value` once for each value:

```bash
tipeline workflow exec abc123def456ghi7890xy --var "message=Hi from a script"
```

The command waits for the run to finish. It exits with `0` when the run succeeds and `1`
when it fails, so a script can check `$?`:

```bash
if tipeline workflow exec abc123def456ghi7890xy --var "message=Nightly check"; then
  echo "done"
else
  echo "the workflow failed" >&2
fi
```

The output is made for people to read. If your program needs the workflow's final values,
use the WebSocket or MCP instead. All commands are listed in the
[CLI reference](/cli/commands).

## WebSocket

Core accepts WebSocket connections on port **4000**, from this machine by default. Send the
token when you connect, then send JSON messages.

Each message names a command in `event` and carries a `correlationId` that you choose. Core
sends every event about that request back with the same `correlationId`.

To run a workflow, send `exec` with the workflow's identifier and your values:

```json
{
  "event": "exec",
  "correlationId": "run-1",
  "payload": {
    "identifier": "abc123def456ghi7890xy",
    "variables": { "message": "Hi from my program" }
  }
}
```

While it runs, you receive:

| Event | When |
|---|---|
| `onTaskStart` | The run started. `data.pipelineIdentifier` names the run |
| `onAction` | A step finished. `data.name` is the action, `data.result` what it returned |
| `onActionError` | A step failed |
| `onTaskEnd` | A run finished. A sub-workflow sends its own as well |
| `onTaskEndAll` | The whole run finished, sub-workflows included |
| `onTaskError` | The run failed. The reason is in `error` |

The run sends no final values. To read them, send `pipelineDetail` with the run's
identifier after `onTaskEndAll`. The answer lists every variable with its final value. A
secret variable keeps its name, but its value comes back empty.

### Example (Node.js)

This program runs a workflow, prints each step as it finishes, and then prints the final
value of the `reply` variable. It uses the [`ws`](https://www.npmjs.com/package/ws) package
(`npm install ws`).

```js
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const token = readFileSync(`${process.env.HOME}/Tipeline/.database/core.token`, 'utf8').trim();
const ws = new WebSocket('ws://127.0.0.1:4000', {
  headers: { Authorization: `Bearer ${token}` },
});

const runId = randomUUID();
let pipelineIdentifier;

ws.on('open', () => {
  ws.send(
    JSON.stringify({
      event: 'exec',
      correlationId: runId,
      payload: {
        identifier: 'abc123def456ghi7890xy',
        variables: { message: 'Hi from my program' },
      },
    })
  );
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  // Every connected client gets every run's events: keep only ours.
  if (msg.correlationId !== runId) return;

  switch (msg.event) {
    case 'onTaskStart':
      // The first start is the run itself; sub-workflows send their own.
      pipelineIdentifier ??= msg.data.pipelineIdentifier;
      console.log('Started', msg.data.name);
      break;
    case 'onAction':
      console.log('  step done:', msg.data.name);
      break;
    case 'onTaskEndAll':
      // Ask for the run's details to read the final variable values.
      ws.send(
        JSON.stringify({
          event: 'pipelineDetail',
          correlationId: runId,
          payload: { pipelineIdentifier },
        })
      );
      break;
    case 'onPipelineDetail': {
      const reply = msg.data.variables.find((v) => v.name === 'reply');
      console.log('Reply:', reply?.value);
      ws.close();
      break;
    }
    case 'onTaskError':
      console.error('Run failed:', msg.error);
      ws.close();
      process.exitCode = 1;
      break;
  }
});
```

```
Started Chat Echo
  step done: script.runScript
Reply: You said: **Hi from my program**
```

The same connection can do everything Desktop does. For example, `taskList` lists the
workflows, `pipelineList` shows a workflow's past runs, and `pipelineCancel` stops a run.
Commands are answered with an event of the same name plus `on`, such as `taskList` →
`onTaskList`. All commands are listed in the [IPC Protocol](/internals/ipc) reference. The
WebSocket takes the same messages, and [WebSocket API](/internals/websocket) covers the
details.

To reach Core from another machine, start it with `TIPELINE_BIND_HOST=0.0.0.0`, connect to
`ws://<host>:4000` and put a TLS proxy in front of it (see [Security](#security)). Use a different port by setting `TIPELINE_WS_PORT`
before Core starts.

## MCP

Core also runs an [MCP](https://modelcontextprotocol.io) server at
`http://127.0.0.1:4002/mcp`, using the same token. It's made for AI tools such as Claude
Code, Claude Desktop and Cursor, but any program can use it.

The MCP tool `exec_task` runs a workflow, **waits for it to finish**, and answers once with
the result:

```json
{
  "status": "completed",
  "pipelineIdentifier": "…",
  "durationMs": 412,
  "outputs": { "reply": "You said: **Hi from my program**" }
}
```

`outputs` are the workflow's [outputs](/workflows/files#outputs). If the workflow marks
none, you get all its public variables instead. Private and secret values are never sent.

### Example (Node.js)

This uses the official MCP SDK (`npm install @modelcontextprotocol/sdk`):

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'fs';

const token = readFileSync(`${process.env.HOME}/Tipeline/.database/core.token`, 'utf8').trim();
const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:4002/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'my-program', version: '1.0.0' });
await client.connect(transport);

const result = await client.callTool({
  name: 'exec_task',
  arguments: {
    identifier: 'abc123def456ghi7890xy',
    variables: { message: 'Hi from my program' },
  },
});

// The tool answers with one text block holding JSON.
const run = JSON.parse(result.content[0].text);
console.log(run.status, run.outputs);

await client.close();
```

### Add it to an AI tool

For Claude Code:

```bash
claude mcp add --transport http tipeline http://127.0.0.1:4002/mcp \
  --header "Authorization: Bearer $(cat ~/Tipeline/.database/core.token)"
```

Setup for other tools, the full list of MCP tools (searching workflows, drafting new ones…)
and what an MCP client can and can't do are in [Connect AI Tools (MCP)](/assistant/mcp).

MCP can find and run workflows, but it can't list past runs, cancel a run or decide on an
approval. Use the WebSocket for those.

## Tipeline Server

The ways in above all use Core's single token, which gives full access. For several people,
or when outside systems need their own credentials, run [Tipeline Server](/server/) in front
of Core. Each person gets a sign-in, each script gets its own
[API token](/server/api#creating-an-api-token-for-scripts-ci) with a role (viewer, editor or
admin), and every token can be revoked and shows up in the audit log.

The server listens on port **4001** (change it with `TIPELINE_SERVER_PORT`) and offers two
ways to run a workflow.

### WebSocket through the server

This uses the same messages as [Core's WebSocket](#websocket). The [example](#example-node-js)
works unchanged once you point it at the server and use an API token:

```js
const ws = new WebSocket('wss://tipeline.example.com:4001', {
  headers: { Authorization: `Bearer ${process.env.TIPELINE_API_TOKEN}` },
});
```

The server adds its own rules. Viewer tokens can't run workflows, a private workflow
belonging to someone else looks like it doesn't exist, and events go only to the connection
that started the run. See [WebSocket gateway](/server/api#_4-websocket-gateway).

### Webhooks

A webhook lets a service such as GitHub or Stripe start **one specific workflow** when
something happens there, without a Tipeline account. An admin creates it (`POST /webhooks`
with the workflow's identifier) and gets a secret token, shown once.

The service then sends a `POST` to `/webhooks/trigger`, with the token in the
`X-Webhook-Token` header:

```bash
curl -X POST https://tipeline.example.com:4001/webhooks/trigger \
  -H "X-Webhook-Token: $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user": {"id": 42, "email": "ana@example.com"}}'
```

What the workflow receives:

- The whole JSON body, in the variable `payload`.
- The query string, as an object in `query` (for example, `?env=prod` gives
  `query.env`).
- Individual fields, if the webhook has a `variables_mapping`. For example,
  `{ "userId": "user.id" }` puts `42` in `userId`. The paths start inside the body.

The server answers `202 { "ok": true }` right away and runs the workflow in the background.
A webhook can't send results back. To check how a run went, read `GET /pipeline-audit` with
an API token, or watch it in Desktop.

## Security

::: danger Core's token is full access
Anyone with Core's token can run any workflow with any values, read run details and change
workflows. Give it only to programs you trust, and keep `core.token` private.
:::

- Core's WebSocket (4000) and MCP (4002) ports only accept connections from **this machine**.
  To open them to others, set `TIPELINE_BIND_HOST` before Core starts: an address of this
  machine, or `0.0.0.0` for all of them. Then block them with a firewall from anyone who
  doesn't need them.
- To reach Core from other machines, put a reverse proxy with TLS (nginx, Caddy) in front
  and connect with `wss://`.
- When more than one person or system needs access, use [Tipeline Server](#tipeline-server)
  instead of sharing Core's token. Only its admins can read Core's token and other credentials
  ([who can see what](/server/#who-can-see-credentials)).

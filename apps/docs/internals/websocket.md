# WebSocket API

::: tip Terminology
In the app and user docs, tasks are called **workflows** (and subtasks **sub-workflows**). The code, database, IPC messages and CLI keep the original `task` naming, which is what this page uses.
:::

The Core engine exposes a **WebSocket server** (default port `4000`) that uses the same IPC message protocol as the local socket. This enables remote clients — on other machines or in external integrations — to control a Tipeline instance over the network.

## Connection

```
ws://host:4000
```

or with TLS (if you configure a reverse proxy):

```
wss://tipeline.example.com
```

## Authentication

All connections must authenticate with a **Bearer token** in the connection handshake:

```javascript
const ws = new WebSocket('ws://host:4000', {
  headers: {
    Authorization: `Bearer ${apiToken}`
  }
});
```

The token is created on first start and stored in the `settings` table (`apiToken`). Core
prints it every time it starts, and writes it to `~/.tipeline/.database/core.token`:

```bash
cat ~/.tipeline/.database/core.token
```

A connection without the right token is closed with code `4001` (`Unauthorized`).

## Message Protocol

Messages are JSON objects. A request names its channel in `event`; a reply carries the
response channel in `event` plus the `IPCMessage` fields (`success`, `data`, `error`,
`correlationId`):

### Sending a Request

```json
{
  "event": "taskList",
  "correlationId": "my-request-1",
  "payload": {}
}
```

### Receiving a Response

```json
{
  "event": "onTaskList",
  "success": true,
  "data": [
    {
      "identifier": "abc123def456ghi7890xy",
      "name": "Daily Report",
      "version": "1.0.0"
    }
  ],
  "error": null,
  "correlationId": null
}
```

### Error Response

```json
{
  "event": "onTaskDetail",
  "success": false,
  "data": null,
  "error": "Task not found",
  "correlationId": null
}
```

## Example: Execute a Task

```javascript
const ws = new WebSocket('ws://localhost:4000', {
  headers: { Authorization: 'Bearer your-api-token' }
});

ws.on('open', () => {
  // Execute a task by identifier
  ws.send(JSON.stringify({
    event: 'exec',
    correlationId: 'run-1',
    payload: {
      identifier: 'abc123def456ghi7890xy',
      variables: {
        reportDate: '2025-05-24'
      }
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);

  // A run streams its events, each with the request's correlationId
  if (msg.event === 'onTaskStart') {
    console.log('Run started:', msg.data.pipelineIdentifier);
  }

  if (msg.event === 'onAction') {
    console.log('Step finished:', msg.data.name, msg.data.result);
  }

  if (msg.event === 'onTaskEndAll' || msg.event === 'onTaskError') {
    console.log('Run finished:', msg.event);
    ws.close();
  }
});
```

## Streaming Events

Run events are broadcast to every authenticated client, whoever started the run:

| Event | Description |
|-------|-------------|
| `onTaskStart` | A run started (`pipelineIdentifier`, task) |
| `onAction` | A step finished: its name, params, result, destination |
| `onActionError` | A step failed |
| `onDebugPaused` | A debug run paused before a step |
| `onTaskEnd` | A run (or a sub-workflow's run) finished, with its status |
| `onTaskEndAll` | The whole run, sub-workflows included, finished |
| `onTaskError` | The run failed |

Each event's `correlationId` matches the request that started the run; a scheduled run gets
its own. Inside Core these travel on the `coreEvents` bus as `taskStart:<correlationId>`,
`action:<correlationId>` and so on, and `TaskStreamListener` turns them into the events
above.

## Available Channels

The WebSocket API exposes the same operations as the IPC protocol. See the [IPC Protocol](/internals/ipc) page for the full channel reference.

### Canceling runs through a Tipeline Server

Through the [Tipeline Server](/server/)'s gateway (not Core's own port), these rules apply:


`pipelineCancel` isn't available to viewers. A run named by `pipelineIdentifier` follows the
same rule as `exec`: a run of someone else's private workflow is reported as `Run not
found`. A run named by `correlationId` (one that doesn't persist) can only be canceled from
the connection that started it. The cancel is recorded under the signed-in user's email —
a `canceledBy` sent by the client is ignored — and written to the audit log (`run.cancel`).

`appRunsActive` answers only with the runs the asking connection started.

## Remote CLI

The CLI can be pointed at a remote WebSocket server using the `remote` commands:

```bash
# Register the remote server
tipeline remote add prod wss://tipeline.example.com:4000 your-api-token

# Use the remote connection
tipeline remote use 1

# All subsequent commands run against the remote engine
tipeline workflow list
tipeline workflow exec abc123def456ghi7890xy
```

## Security Recommendations

- Run the WebSocket server behind a TLS-terminating reverse proxy (nginx, Caddy) in production
- Use a strong, randomly-generated API token
- Restrict network access to the WebSocket port — only expose it to trusted IPs or VPN clients
- Rotate the API token periodically via the Settings page

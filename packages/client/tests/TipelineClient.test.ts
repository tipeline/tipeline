import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws';
import {
  CommandError,
  ConnectionLostError,
  RequestTimeoutError,
  TipelineClient,
  type ConnectionStatus,
  type RunEvent,
} from '../src/index.js';

/**
 * Behaves like the Server's gateway: accepts `['tipeline', 'bearer.<token>']`, closes with
 * 4001 for an unknown token, and answers commands with `script`.
 */
class FakeServer {
  http = http.createServer();
  wss: WebSocketServer;
  sockets = new Set<ServerSocket>();
  received: any[] = [];
  protocolsSeen: string[] = [];
  script: (msg: any, reply: (m: any) => void) => void = (msg, reply) =>
    reply({ event: `on${msg.event[0].toUpperCase()}${msg.event.slice(1)}`, correlationId: msg.correlationId, data: { ok: true } });
  url = '';

  constructor(private readonly validToken = 'good') {
    this.wss = new WebSocketServer({
      server: this.http,
      handleProtocols: (protocols) => (protocols.has('tipeline') ? 'tipeline' : false),
    });
    this.wss.on('connection', (ws, req) => {
      const offered = String(req.headers['sec-websocket-protocol'] ?? '');
      this.protocolsSeen.push(offered);
      const token = offered.split(',').map((p) => p.trim()).find((p) => p.startsWith('bearer.'))?.slice(7);
      if (token !== this.validToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }
      this.sockets.add(ws);
      ws.on('close', () => this.sockets.delete(ws));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        this.received.push(msg);
        this.script(msg, (m) => ws.send(JSON.stringify(m)));
      });
    });
  }

  async start() {
    await new Promise<void>((r) => this.http.listen(0, r));
    this.url = `ws://127.0.0.1:${(this.http.address() as AddressInfo).port}`;
  }

  broadcast(m: any) {
    for (const ws of this.sockets) ws.send(JSON.stringify(m));
  }

  dropAll() {
    for (const ws of this.sockets) ws.terminate();
  }

  async stop() {
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((r) => this.wss.close(() => r()));
    await new Promise<void>((r) => this.http.close(() => r()));
  }
}

const waitFor = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 5));
  }
};

let server: FakeServer;
let client: TipelineClient | null;

beforeEach(async () => {
  server = new FakeServer();
  await server.start();
  client = null;
});
afterEach(async () => {
  client?.close();
  await server.stop();
});

const makeClient = (opts: Partial<ConstructorParameters<typeof TipelineClient>[0]> = {}) => {
  client = new TipelineClient({ url: server.url, token: 'good', reconnectDelayMs: 20, ...opts });
  return client;
};

describe('TipelineClient requests', () => {
  it('signs in with the token as a subprotocol and resolves with the answer data', async () => {
    const c = makeClient();
    server.script = (msg, reply) => reply({ event: 'onTaskList', correlationId: msg.correlationId, data: [{ identifier: 'a' }] });
    await expect(c.request('taskList')).resolves.toEqual([{ identifier: 'a' }]);
    expect(server.protocolsSeen[0]).toBe('tipeline, bearer.good');
    expect(server.received[0]).toMatchObject({ event: 'taskList', payload: {} });
  });

  it('connects on the first request and sends what was queued once open', async () => {
    const c = makeClient();
    expect(c.connectionStatus).toBe('idle');
    const both = Promise.all([c.request('status'), c.request('taskList', { search: 'x' })]);
    expect(c.connectionStatus).toBe('connecting');
    await both;
    expect(server.received.map((m) => m.event)).toEqual(['status', 'taskList']);
    expect(server.received[1].payload).toEqual({ search: 'x' });
    expect(c.connectionStatus).toBe('open');
  });

  it('rejects with the Server error as a CommandError', async () => {
    const c = makeClient();
    server.script = (msg, reply) =>
      reply({ event: 'onScheduleSet', correlationId: msg.correlationId, error: 'Permission denied: "scheduleSet" requires an admin.' });
    const err = await c.request('scheduleSet', {}).catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.message).toMatch(/requires an admin/);
  });

  it('ignores answers for other commands on the same correlationId', async () => {
    const c = makeClient();
    server.script = (msg, reply) => {
      reply({ event: 'error', correlationId: msg.correlationId, data: { message: 'generic' } });
      reply({ event: 'onTaskList', correlationId: msg.correlationId, data: [] });
    };
    await expect(c.request('taskList')).resolves.toEqual([]);
  });

  it('times out when nothing answers', async () => {
    const c = makeClient({ requestTimeoutMs: 50 });
    server.script = () => {};
    await expect(c.request('taskList')).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('refuses run commands, which need run()', async () => {
    const c = makeClient();
    await expect(c.request('exec', {})).rejects.toThrow(/use run\(\)/);
  });
});

describe('TipelineClient runs', () => {
  it('reports every event and finishes on end_all, not on a sub-workflow end', async () => {
    const c = makeClient();
    server.script = (msg, reply) => {
      const id = msg.correlationId;
      reply({ event: 'onTaskStart', correlationId: id, data: { pipelineIdentifier: 'p1' } });
      reply({ event: 'onAction', correlationId: id, data: { identifier: 'step-1' } });
      reply({ event: 'onTaskEnd', correlationId: id });
      reply({ event: 'onAction', correlationId: id, data: { identifier: 'step-2' } });
      reply({ event: 'onTaskEndAll', correlationId: id });
    };
    const seen: RunEvent[] = [];
    const run = c.run('exec', { identifier: 'w' }, (e) => seen.push(e));
    const last = await run.done;
    expect(seen.map((e) => e.type)).toEqual(['start', 'action', 'end', 'action', 'end_all']);
    expect(seen[1].data).toEqual({ identifier: 'step-1' });
    expect(last.type).toBe('end_all');
    expect(server.received[0]).toMatchObject({ event: 'exec', correlationId: run.correlationId });
  });

  it('finishes on a run error', async () => {
    const c = makeClient();
    server.script = (msg, reply) => reply({ event: 'onTaskError', correlationId: msg.correlationId, error: 'boom' });
    const last = await c.run('exec', { identifier: 'w' }).done;
    expect(last).toMatchObject({ type: 'error', error: 'boom' });
  });

  it('finishes with an error when the Server refuses the run', async () => {
    const c = makeClient();
    server.script = (msg, reply) =>
      reply({ event: 'onExec', correlationId: msg.correlationId, error: 'Permission denied: viewers cannot run "exec"' });
    const last = await c.run('exec', { identifier: 'w' }).done;
    expect(last.type).toBe('error');
    expect(last.error).toMatch(/viewers cannot run/);
  });

  it('stops reporting after stopListening', async () => {
    const c = makeClient();
    let reply!: (m: any) => void;
    let id = '';
    server.script = (msg, r) => {
      reply = r;
      id = msg.correlationId;
    };
    const seen: RunEvent[] = [];
    const run = c.run('exec', { identifier: 'w' }, (e) => seen.push(e));
    await waitFor(() => id !== '');
    reply({ event: 'onTaskStart', correlationId: id });
    await waitFor(() => seen.length === 1);
    run.stopListening();
    reply({ event: 'onAction', correlationId: id });
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toHaveLength(1);
  });
});

describe('TipelineClient connection', () => {
  it('stops on a refused token: queued requests fail, later ones fail at once, no retries', async () => {
    const c = makeClient({ token: 'bad' });
    const statuses: ConnectionStatus[] = [];
    c.onStatusChange((s) => statuses.push(s));
    const err = await c.request('taskList').catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.message).toMatch(/Sign in again/);
    expect(c.connectionStatus).toBe('unauthorized');
    await expect(c.request('status')).rejects.toThrow(/Sign in again/);
    const run = await c.run('exec', {}).done.catch((e) => e);
    expect(run.message).toMatch(/Sign in again/);
    await new Promise((r) => setTimeout(r, 80));
    expect(server.protocolsSeen).toHaveLength(1);
    // The Server checks the token after the handshake, so the socket is open for a moment.
    expect(statuses).toEqual(['connecting', 'open', 'unauthorized']);
  });

  it('connects again with a new token from setToken', async () => {
    const c = makeClient({ token: 'bad' });
    await c.request('taskList').catch(() => {});
    c.setToken('good');
    await expect(c.request('taskList')).resolves.toEqual({ ok: true });
    expect(c.connectionStatus).toBe('open');
  });

  it('on a dropped connection: sent requests and runs fail, then it reconnects and works', async () => {
    const c = makeClient();
    await c.request('status');
    server.script = () => {};
    const inFlight = c.request('taskList').catch((e) => e);
    const run = c.run('exec', { identifier: 'w' });
    const runResult = run.done.catch((e) => e);
    await waitFor(() => server.received.length === 3);

    const statuses: ConnectionStatus[] = [];
    c.onStatusChange((s) => statuses.push(s));
    server.dropAll();

    expect(await inFlight).toBeInstanceOf(ConnectionLostError);
    expect(await runResult).toBeInstanceOf(ConnectionLostError);

    server.script = (msg, reply) => reply({ event: 'onStatus', correlationId: msg.correlationId, data: 'back' });
    await expect(c.request('status')).resolves.toBe('back');
    expect(statuses).toEqual(['reconnecting', 'open']);
  });

  it('keeps requests made while reconnecting and sends them once back', async () => {
    const c = makeClient({ reconnectDelayMs: 60 });
    await c.request('status');
    server.dropAll();
    await waitFor(() => c.connectionStatus === 'reconnecting');
    server.script = (msg, reply) => reply({ event: 'onTaskList', correlationId: msg.correlationId, data: ['queued'] });
    await expect(c.request('taskList')).resolves.toEqual(['queued']);
  });

  it('retries with a growing delay while the Server is down', async () => {
    const c = makeClient({ reconnectDelayMs: 20, maxReconnectDelayMs: 40 });
    await c.request('status');
    const url = server.url;
    await server.stop();
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 200));
    expect(c.connectionStatus).toBe('reconnecting');

    server = new FakeServer();
    const port = Number(new URL(url).port);
    await new Promise<void>((r) => server.http.listen(port, '127.0.0.1', r));
    server.url = url;
    await waitFor(() => c.connectionStatus === 'open', 1000);
    expect(Date.now() - started).toBeGreaterThan(200);
  });

  it('reconnectNow skips the wait', async () => {
    const c = makeClient({ reconnectDelayMs: 10_000 });
    await c.request('status');
    server.dropAll();
    await waitFor(() => c.connectionStatus === 'reconnecting');
    c.reconnectNow();
    await waitFor(() => c.connectionStatus === 'open', 500);
  });

  it('close() rejects what is waiting and stays closed', async () => {
    const c = makeClient({ reconnectDelayMs: 10_000 });
    await c.request('status');
    server.dropAll();
    await waitFor(() => c.connectionStatus === 'reconnecting');
    const queued = c.request('taskList').catch((e) => e);
    c.close();
    expect(await queued).toBeInstanceOf(ConnectionLostError);
    expect(c.connectionStatus).toBe('idle');
  });

  it('hands every message to subscribers, including other runs', async () => {
    const c = makeClient();
    const got: any[] = [];
    c.subscribe((m) => got.push(m));
    await c.request('status');
    server.broadcast({ event: 'onTaskEndAll', correlationId: 'someone-else' });
    await waitFor(() => got.length === 2);
    expect(got[1]).toMatchObject({ event: 'onTaskEndAll', correlationId: 'someone-else' });
  });

  it('accepts an https address and turns it into wss/ws', () => {
    const c = new TipelineClient({ url: 'http://127.0.0.1:1/', token: 't' });
    expect((c as any).url).toBe('ws://127.0.0.1:1');
  });
});

describe('TipelineClient Assistant', () => {
  it('reports each update of a request and settles on the proposal', async () => {
    const c = makeClient();
    server.script = (msg, reply) => {
      const send = (data: any) => reply({ event: 'onAssistantAsk', correlationId: msg.correlationId, data });
      send({ requestId: 'r-1', phase: 'thinking' });
      send({ requestId: 'r-1', phase: 'searching', query: 'sales' });
      send({ requestId: 'r-1', phase: 'proposal', text: 'This one.', proposal: { identifier: 'sales', name: 'Sales' } });
      send({ requestId: 'r-1', phase: 'thinking' }); // after the end: ignored
    };
    const phases: string[] = [];
    const handle = c.ask('sales for May', (u) => phases.push(u.phase!), { projectIdentifier: 'acme' });
    await expect(handle.done).resolves.toMatchObject({ phase: 'proposal', proposal: { identifier: 'sales' } });
    expect(phases).toEqual(['thinking', 'searching', 'proposal']);
    expect(server.received[0]).toMatchObject({ event: 'assistantAsk', payload: { prompt: 'sales for May', projectIdentifier: 'acme' } });
  });

  it('rejects with the Server error', async () => {
    const c = makeClient();
    server.script = (msg, reply) =>
      reply({ event: 'onAssistantAsk', correlationId: msg.correlationId, error: 'Permission denied: the Assistant is for editors and admins.' });
    const updates: any[] = [];
    const err = await c.ask('x', (u) => updates.push(u)).done.catch((e) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err.message).toMatch(/editors and admins/);
    expect(updates).toEqual([{ error: 'Permission denied: the Assistant is for editors and admins.' }]);
  });

  it('follows a run for the Assistant: its run events, then the answer', async () => {
    const c = makeClient();
    server.script = (msg, reply) => {
      const id = msg.correlationId;
      reply({ event: 'onAssistantRun', correlationId: id, data: { requestId: 'r-1', phase: 'task_running', identifier: 'sales' } });
      reply({ event: 'onTaskStart', correlationId: id, data: { pipelineIdentifier: 'p-1' } });
      reply({ event: 'onTaskEndAll', correlationId: id, data: 'Workflow finished successfully' });
      reply({ event: 'onAssistantRun', correlationId: id, data: { requestId: 'r-1', phase: 'run_finished', result: { status: 'completed' } } });
      reply({ event: 'onAssistantRun', correlationId: id, data: { requestId: 'r-1', phase: 'done', answer: '42.' } });
    };
    const runEvents: string[] = [];
    const phases: string[] = [];
    const handle = c.runForAssistant(
      { requestId: 'r-1', identifier: 'sales', variables: { month: 'May' } },
      (u) => phases.push(u.phase!),
      (e) => runEvents.push(e.type)
    );
    await expect(handle.done).resolves.toMatchObject({ phase: 'done', answer: '42.' });
    expect(phases).toEqual(['task_running', 'run_finished', 'done']);
    expect(runEvents).toEqual(['start', 'end_all']);
  });

  it('remembers a choice and lists the history with plain requests', async () => {
    const c = makeClient();
    server.script = (msg, reply) =>
      reply({
        event: `on${msg.event[0].toUpperCase()}${msg.event.slice(1)}`,
        correlationId: msg.correlationId,
        data: msg.event === 'assistantHistory' ? [{ id: 'r-1' }] : { remembered: true },
      });
    await c.rememberAssistantChoice('sale', { identifier: 'sales', name: 'Sales' });
    await expect(c.assistantHistory({ scope: 'everyone' })).resolves.toEqual([{ id: 'r-1' }]);
    expect(server.received.map((m) => [m.event, m.payload])).toEqual([
      ['assistantChoose', { requestKey: 'sale', identifier: 'sales', name: 'Sales' }],
      ['assistantHistory', { scope: 'everyone' }],
    ]);
    await expect(c.request('assistantAsk', {})).rejects.toThrow(/use ask\(\)/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

// An answer is for whoever asked. One nobody connected asked for (the asker left, or a
// webhook or schedule started the run) must not be handed to every user instead.
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: {
    validateToken: async (token: string) =>
      token === 'viewer'
        ? { id: 'u-v', email: 'v@acme.com', name: 'Vi', role: 'viewer' }
        : { id: 'u-e', email: 'e@acme.com', name: 'Ed', role: 'editor' },
  },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: { getOwner: async () => null, privateOwnedByOthers: async () => new Set(), claim: vi.fn(), remove: vi.fn() },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: { start: vi.fn(), attachPipelineId: vi.fn(), complete: vi.fn(), getRequester: async () => null },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({ AuditLogService: { log: vi.fn(async () => {}) } }));
vi.mock('../src/assistant/AssistantHistoryService.js', () => ({ AssistantHistoryService: {} }));

import { WsGateway } from '../src/ws/WsGateway.js';

const SOURCE = JSON.stringify({ pipeline: { variables: [{ name: 'apiKey', secret: true, value: 's3cr3t' }] } });

/** Answers each request after `delay` ms with a workflow whose source holds a secret. */
class FakeCore {
  delay = 150;
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request() {
    return {};
  }
  send(event: string, payload: any) {
    setTimeout(() => this.emit(`on${event[0].toUpperCase()}${event.slice(1)}`, payload.correlationId, { identifier: 'w1', source: SOURCE }), this.delay);
  }
  emit(event: string, correlationId: string | undefined, data: any) {
    this.handlers.get(event)?.({ ...(correlationId ? { correlationId } : {}), data });
  }
}

let server: http.Server;
let port: number;
let core: FakeCore;
const open: WebSocket[] = [];
beforeEach(async () => {
  core = new FakeCore();
  server = http.createServer();
  new WsGateway(core as any).attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  open.splice(0).forEach((ws) => ws.close());
  await new Promise<void>((r) => server.close(() => r()));
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function connect(token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: `Bearer ${token}` } });
  const received: any[] = [];
  ws.on('message', (raw: any) => {
    const message = JSON.parse(raw.toString());
    if (message.event !== 'connected') received.push(message);
  });
  await new Promise((r) => ws.on('open', r));
  open.push(ws);
  return { ws, received };
}
const ask = (ws: WebSocket, event: string, correlationId: string) =>
  ws.send(JSON.stringify({ event, correlationId, payload: { identifier: 'w1', projectIdentifier: 'p1', taskIdentifier: 'w1', source: SOURCE } }));

describe('WsGateway: answers nobody here asked for', () => {
  for (const event of ['projectAssignTask', 'taskUpdateSource']) {
    it(`${event}: an answer arriving after its asker left goes to nobody`, async () => {
      const viewer = await connect('viewer');
      const editor = await connect('editor');
      ask(editor.ws, event, `c-${event}`);
      await wait(30);
      editor.ws.close();
      await wait(300);

      expect(viewer.received).toEqual([]);
    });
  }

  it('the asker still gets its answer', async () => {
    const viewer = await connect('viewer');
    const editor = await connect('editor');
    ask(editor.ws, 'projectAssignTask', 'c-1');
    await wait(300);

    expect(editor.received.map((m) => m.event)).toEqual(['onProjectAssignTask']);
    expect(viewer.received).toEqual([]);
  });

  it('events of a run started elsewhere (a webhook) go to nobody', async () => {
    const viewer = await connect('viewer');
    await wait(20);
    core.emit('onTaskStart', 'webhook-1-123', { pipelineIdentifier: 'p-1', name: 'Private one' });
    core.emit('onAction', 'webhook-1-123', { result: 's3cr3t' });
    core.emit('onTaskEnd', 'webhook-1-123', { pipelineIdentifier: 'p-1', outputs: { token: 's3cr3t' } });
    await wait(100);

    expect(viewer.received).toEqual([]);
  });

  it('an event with no correlationId still goes to everyone', async () => {
    const viewer = await connect('viewer');
    const editor = await connect('editor');
    await wait(20);
    core.emit('onTaskEndAll', undefined, {});
    await wait(100);

    expect(viewer.received.map((m) => m.event)).toEqual(['onTaskEndAll']);
    expect(editor.received.map((m) => m.event)).toEqual(['onTaskEndAll']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const users: Record<string, any> = {
  'tok-admin': { id: 'u-ad', email: 'ad@acme.com', name: 'Ad', role: 'admin' },
  'tok-editor': { id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' },
  'tok-viewer': { id: 'u-view', email: 'vi@acme.com', name: 'Vi', role: 'viewer' },
};
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async (t: string) => users[t] ?? null },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: { getOwner: async () => null, privateOwnedByOthers: async () => new Set(), claim: vi.fn(), remove: vi.fn() },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: { start: vi.fn(), attachPipelineId: vi.fn(), complete: vi.fn(), getRequester: async () => null },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({ AuditLogService: { log: vi.fn(async () => {}) } }));
vi.mock('../src/assistant/AssistantHistoryService.js', () => ({
  AssistantHistoryService: {
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    list: vi.fn(async () => [{ id: 'r-1', prompt: 'hi' }]),
    getChoices: vi.fn(async () => ({})),
    saveChoices: vi.fn(),
  },
}));

import { WsGateway } from '../src/ws/WsGateway.js';

/** Stands in for Core: no Assistant key is set, and forwarded commands are recorded. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  sent: string[] = [];
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    if (event === 'settingsList') return {};
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    this.sent.push(event);
    const resp = `on${event[0].toUpperCase()}${event.slice(1)}`;
    setTimeout(() => this.handlers.get(resp)?.({ correlationId: payload.correlationId, data: { ok: true } }));
  }
}

let server: http.Server;
let core: FakeCore;
let port: number;

beforeEach(async () => {
  core = new FakeCore();
  server = http.createServer();
  new WsGateway(core as any).attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function ask(token: string, event: string, payload: any = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: `Bearer ${token}` } });
  await new Promise((r) => ws.on('open', r));
  const reply = await new Promise<any>((resolve) => {
    ws.on('message', (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.correlationId === 'c-1') resolve(msg);
    });
    ws.send(JSON.stringify({ event, correlationId: 'c-1', payload }));
  });
  ws.close();
  return reply;
}

describe('WsGateway: the Assistant', () => {
  it('turns viewers away', async () => {
    const reply = await ask('tok-viewer', 'assistantAsk', { prompt: 'sales' });
    expect(reply).toMatchObject({ event: 'onAssistantAsk', error: expect.stringMatching(/editors and admins/) });
  });

  it('answers an editor itself, without forwarding to Core', async () => {
    const reply = await ask('tok-editor', 'assistantAsk', { prompt: 'sales' });
    expect(reply).toMatchObject({ event: 'onAssistantAsk', error: expect.stringMatching(/isn't set up/) });
    expect(core.sent).not.toContain('assistantAsk');
  });

  it('lists the asker’s own requests', async () => {
    const reply = await ask('tok-editor', 'assistantHistory');
    expect(reply).toMatchObject({ event: 'onAssistantHistory', data: [{ id: 'r-1' }] });
  });

  it('limits how often one user may ask', async () => {
    let last: any;
    for (let i = 0; i < 31; i++) last = await ask('tok-admin', 'assistantAsk', { prompt: 'sales' });
    expect(last.error).toMatch(/Too many requests to the Assistant/);
  });
});

describe('WsGateway: Core’s own assistant history', () => {
  it('is for admins only: it has no user, so it is everyone’s', async () => {
    expect((await ask('tok-viewer', 'agentRunList')).error).toMatch(/Permission denied/);
    expect((await ask('tok-editor', 'agentRunList')).error).toMatch(/requires an admin/);
    expect((await ask('tok-admin', 'agentRunList')).data).toEqual({ ok: true });
  });

  it('cannot be written through the Server', async () => {
    for (const event of ['agentRunSetPipeline', 'agentRunCreate', 'agentPrompt', 'agentToolCall', 'agentToolList']) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: 'Bearer tok-admin' } });
      await new Promise((r) => ws.on('open', r));
      const reply = await new Promise<any>((resolve) => {
        ws.on('message', (raw: any) => resolve(JSON.parse(raw.toString())));
        ws.send(JSON.stringify({ event, correlationId: 'c-1', payload: {} }));
      });
      ws.close();
      expect(reply).toMatchObject({ event: 'error', data: { message: `Unknown command: ${event}` } });
    }
    expect(core.sent).toEqual([]);
  });
});

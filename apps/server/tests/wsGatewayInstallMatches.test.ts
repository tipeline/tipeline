import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const users: Record<string, any> = {
  'tok-ana': { id: 'u-ana', email: 'ana@acme.com', name: 'Ana', role: 'editor' },
  'tok-admin': { id: 'u-admin', email: 'admin@acme.com', name: 'Ad', role: 'admin' },
};
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async (t: string) => users[t] ?? null },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: {
    getOwner: async () => null,
    // Bob's private workflow, as far as Ana is concerned.
    privateOwnedByOthers: async () => new Set(['wf-bob-private']),
    claim: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: {
    start: vi.fn(async () => {}),
    attachPipelineId: vi.fn(async () => {}),
    complete: vi.fn(async () => {}),
    getRequester: async () => null,
  },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({
  AuditLogService: { log: vi.fn(async () => {}) },
}));

import { WsGateway } from '../src/ws/WsGateway.js';

// What Core answers when an install asks first and the file may duplicate workflows.
const EXISTING = [
  { identifier: 'wf-shared', name: 'Flow', sameFile: true, edited: false },
  { identifier: 'wf-bob-private', name: 'Flow', sameFile: false, edited: null },
];

/** Stands in for Core: answers an asking taskInstall with the matches above. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    if (event === 'taskInstall') {
      setTimeout(() =>
        this.handlers.get('onTaskInstall')?.({ success: true, correlationId: payload.correlationId, data: { existing: EXISTING } })
      );
    }
  }
}

let server: http.Server;
let port: number;

beforeEach(async () => {
  server = http.createServer();
  new WsGateway(new FakeCore() as any).attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function ask(token: string, correlationId: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: `Bearer ${token}` } });
  await new Promise((r) => ws.on('open', r));
  const msg = await new Promise<any>((resolve) => {
    ws.on('message', (raw: any) => {
      const parsed = JSON.parse(raw.toString());
      if (parsed.correlationId === correlationId) resolve(parsed);
    });
    ws.send(JSON.stringify({ event: 'taskInstall', correlationId, payload: { content: 'name: Flow', ask: true } }));
  });
  ws.close();
  return msg;
}

describe('WsGateway taskInstall that asks first', () => {
  it("leaves out matches that are another user's private workflows", async () => {
    const res = await ask('tok-ana', 'q-ana');
    expect(res.data.existing.map((w: any) => w.identifier)).toEqual(['wf-shared']);
  });

  it('shows admins every match', async () => {
    const res = await ask('tok-admin', 'q-admin');
    expect(res.data.existing).toEqual(EXISTING);
  });
});

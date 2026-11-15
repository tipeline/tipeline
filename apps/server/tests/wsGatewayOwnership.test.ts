import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const { claim } = vi.hoisted(() => ({ claim: vi.fn(async (_id: string, _user: string) => {}) }));
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async () => ({ id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' }) },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: { getOwner: async () => null, privateOwnedByOthers: async () => new Set(), claim, remove: vi.fn() },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: { start: vi.fn(), attachPipelineId: vi.fn(), complete: vi.fn(), getRequester: async () => null },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({ AuditLogService: { log: vi.fn(async () => {}) } }));
vi.mock('../src/assistant/AssistantHistoryService.js', () => ({ AssistantHistoryService: {} }));

import { WsGateway } from '../src/ws/WsGateway.js';

/** Core answers an install the way it does: a message, with the identifier beside it. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request() {
    return {};
  }
  send(event: string, payload: any) {
    const answer =
      event === 'taskInstall'
        ? { success: true, correlationId: payload.correlationId, data: 'Workflow installed successfully: wf-1', identifier: 'wf-1' }
        : { correlationId: payload.correlationId, data: { identifier: 'wf-2', name: 'New' } };
    setTimeout(() => this.handlers.get(`on${event[0].toUpperCase()}${event.slice(1)}`)?.(answer));
  }
}

let server: http.Server;
let port: number;
beforeEach(async () => {
  claim.mockClear();
  server = http.createServer();
  new WsGateway(new FakeCore() as any).attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function send(event: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ws.on('open', r));
  const reply = await new Promise<any>((resolve) => {
    ws.on('message', (raw: any) => resolve(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ event, correlationId: 'c-1', payload: { content: 'x' } }));
  });
  ws.close();
  return reply;
}

describe('WsGateway: who owns a new workflow', () => {
  it('the user who installed it through the Server', async () => {
    const reply = await send('taskInstall');
    expect(reply.data).toBe('Workflow installed successfully: wf-1');
    await vi.waitFor(() => expect(claim).toHaveBeenCalledWith('wf-1', 'u-ed'));
  });

  it('the user who created it', async () => {
    await send('taskNew');
    await vi.waitFor(() => expect(claim).toHaveBeenCalledWith('wf-2', 'u-ed'));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

// Runs of another user's private workflow: left out of run lists and counts, and their
// detail answers as a missing run, for everyone but admins and the owner.
const state = vi.hoisted(() => ({ role: 'editor' as string }));
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async () => ({ id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: state.role }) },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: {
    getOwner: async (id: string) =>
      id === 'secret'
        ? { user_id: 'u-admin', user_email: 'admin@acme.com', visibility: 'private' }
        : id === 'mine'
          ? { user_id: 'u-ed', user_email: 'ed@acme.com', visibility: 'private' }
          : null,
    privateOwnedByOthers: async (userId: string) => new Set(userId === 'u-admin' ? [] : ['secret']),
    claim: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: { start: vi.fn(), attachPipelineId: vi.fn(), complete: vi.fn(), getRequester: async () => null },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({ AuditLogService: { log: vi.fn(async () => {}) } }));
vi.mock('../src/assistant/AssistantHistoryService.js', () => ({ AssistantHistoryService: {} }));

import { WsGateway } from '../src/ws/WsGateway.js';

class FakeCore {
  sent: { event: string; payload: any }[] = [];
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request() {
    return {};
  }
  send(event: string, payload: any) {
    this.sent.push({ event, payload: payload.payload });
    const data =
      event === 'pipelineDetail'
        ? { identifier: payload.payload.pipelineIdentifier, task: { identifier: payload.payload.pipelineIdentifier.split(':')[0] } }
        : [];
    setTimeout(() =>
      this.handlers.get(`on${event[0].toUpperCase()}${event.slice(1)}`)?.({ correlationId: payload.correlationId, data })
    );
  }
}

let server: http.Server;
let port: number;
let core: FakeCore;
beforeEach(async () => {
  state.role = 'editor';
  core = new FakeCore();
  server = http.createServer();
  new WsGateway(core as any).attach(server);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
});
afterEach(() => new Promise<void>((r) => server.close(() => r())));

async function send(event: string, payload: any) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: 'Bearer t' } });
  await new Promise((r) => ws.on('open', r));
  const reply = await new Promise<any>((resolve) => {
    ws.on('message', (raw: any) => resolve(JSON.parse(raw.toString())));
    ws.send(JSON.stringify({ event, correlationId: 'c-1', payload }));
  });
  ws.close();
  return reply;
}

describe('WsGateway: runs of private workflows', () => {
  it('asks Core to leave other users’ private workflows out of run lists and counts', async () => {
    await send('pipelineList', { limit: 20, excludeTasks: [] });
    await send('pipelineStats', { boundaries: ['2026-11-15T00:00:00Z', '2026-11-16T00:00:00Z'] });
    expect(core.sent.map((s) => s.payload.excludeTasks)).toEqual([['secret'], ['secret']]);
    expect(core.sent[0].payload.limit).toBe(20);
  });

  it('leaves the list alone for admins', async () => {
    state.role = 'admin';
    await send('pipelineList', { limit: 20 });
    expect(core.sent[0].payload.excludeTasks).toBeUndefined();
  });

  it('answers a hidden run’s detail as a missing run', async () => {
    const reply = await send('pipelineDetail', { pipelineIdentifier: 'secret:run-1' });
    expect(reply).toMatchObject({ event: 'onPipelineDetail', correlationId: 'c-1', error: 'Run not found' });
    expect(reply.data).toBeUndefined();
  });

  it('shows the detail of the user’s own private workflow, a shared one, and any to admins', async () => {
    expect((await send('pipelineDetail', { pipelineIdentifier: 'mine:run-1' })).data.identifier).toBe('mine:run-1');
    expect((await send('pipelineDetail', { pipelineIdentifier: 'shared:run-1' })).data.identifier).toBe('shared:run-1');
    state.role = 'admin';
    expect((await send('pipelineDetail', { pipelineIdentifier: 'secret:run-1' })).data.identifier).toBe('secret:run-1');
  });
});

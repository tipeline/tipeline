import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const users: Record<string, any> = {
  'tok-ana': { id: 'u-ana', email: 'ana@acme.com', name: 'Ana', role: 'editor' },
  'tok-bob': { id: 'u-bob', email: 'bob@acme.com', name: 'Bob', role: 'editor' },
  'tok-viewer': { id: 'u-view', email: 'view@acme.com', name: 'Vi', role: 'viewer' },
};
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async (t: string) => users[t] ?? null },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: {
    getOwner: async () => null,
    privateOwnedByOthers: async () => new Set(),
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
const auditLog = vi.fn(async (_e: any) => {});
vi.mock('../src/audit/AuditLogService.js', () => ({
  AuditLogService: { log: (e: any) => auditLog(e) },
}));

import { WsGateway } from '../src/ws/WsGateway.js';

const APP = {
  name: 'Invoices',
  source: JSON.stringify({
    workflows: { pay: { identifier: 'wf-pay' } },
    pages: [{ id: 'home', runnables: { submit: { mode: 'run', workflow: 'pay' } } }],
  }),
};

/** Stands in for Core: app runs never finish; appRunsActive lists every run it was sent. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  runs: string[] = [];
  canceled: any[] = [];
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    if (event === 'appDetail') return APP;
    if (event === 'pipelineDetail') return { task: { identifier: 'wf-pay' } };
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    if (event === 'appRun') {
      this.runs.push(payload.correlationId);
      return;
    }
    if (event === 'pipelineCancel') {
      this.canceled.push(payload.payload);
      setTimeout(() =>
        this.handlers.get('onPipelineCancel')?.({
          correlationId: payload.correlationId,
          data: { status: 'canceling' },
        })
      );
      return;
    }
    if (event === 'appRunsActive') {
      const data = this.runs.map((correlationId) => ({ correlationId, appIdentifier: 'app-1' }));
      setTimeout(() =>
        this.handlers.get('onAppRunsActive')?.({ correlationId: payload.correlationId, data })
      );
    }
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

async function client(token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  await new Promise((r) => ws.on('open', r));
  const send = (event: string, correlationId: string, payload: any) =>
    ws.send(JSON.stringify({ event, correlationId, payload }));
  const ask = (event: string, correlationId: string, payload: any) =>
    new Promise<any>((resolve) => {
      const onMsg = (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.correlationId === correlationId) {
          ws.off('message', onMsg);
          resolve(msg);
        }
      };
      ws.on('message', onMsg);
      send(event, correlationId, payload);
    });
  return { ws, send, ask };
}

describe('WsGateway appRunsActive', () => {
  it('lists only the app runs this connection started', async () => {
    const ana = await client('tok-ana');
    const bob = await client('tok-bob');
    const run = { appIdentifier: 'app-1', pageId: 'home', runnable: 'submit', inputs: {} };
    ana.send('appRun', 'run-ana', run);
    bob.send('appRun', 'run-bob', run);
    await vi.waitFor(() => expect(core.runs).toHaveLength(2));

    const forAna = await ana.ask('appRunsActive', 'q-ana', { appIdentifier: 'app-1' });
    const forBob = await bob.ask('appRunsActive', 'q-bob', { appIdentifier: 'app-1' });

    expect(forAna.data.map((r: any) => r.correlationId)).toEqual(['run-ana']);
    expect(forBob.data.map((r: any) => r.correlationId)).toEqual(['run-bob']);
    ana.ws.close();
    bob.ws.close();
  });
});

describe('WsGateway pipelineCancel', () => {
  it('cancels as the signed-in user (whatever name the client sends) and audits it', async () => {
    auditLog.mockClear();
    const ana = await client('tok-ana');
    const res = await ana.ask('pipelineCancel', 'q-1', { pipelineIdentifier: 'p-1', canceledBy: 'someone-else' });

    expect(res.data).toEqual({ status: 'canceling' });
    expect(core.canceled).toEqual([{ pipelineIdentifier: 'p-1', canceledBy: 'ana@acme.com' }]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'ana@acme.com',
        action: 'run.cancel',
        targetId: 'p-1',
        metadata: { workflow: 'wf-pay' },
      })
    );
    ana.ws.close();
  });

  it('refuses viewers', async () => {
    const viewer = await client('tok-viewer');
    const reply = await new Promise<any>((resolve) => {
      viewer.ws.once('message', (raw: any) => resolve(JSON.parse(raw.toString())));
      viewer.send('pipelineCancel', 'q-v', { pipelineIdentifier: 'p-1' });
    });
    expect(JSON.stringify(reply)).toMatch(/denied|not allowed|permission/i);
    expect(core.canceled).toEqual([]);
    viewer.ws.close();
  });

  it("cancels a run that doesn't persist only from the connection that started it", async () => {
    const ana = await client('tok-ana');
    const bob = await client('tok-bob');
    ana.send('appRun', 'run-ana', { appIdentifier: 'app-1', pageId: 'home', runnable: 'submit', inputs: {} });
    await vi.waitFor(() => expect(core.runs).toEqual(['run-ana']));

    const byBob = await bob.ask('pipelineCancel', 'q-b', { correlationId: 'run-ana' });
    expect(byBob.error).toBe('Run not found');
    const byAna = await ana.ask('pipelineCancel', 'q-a', { correlationId: 'run-ana' });
    expect(byAna.data).toEqual({ status: 'canceling' });
    expect(core.canceled).toEqual([{ correlationId: 'run-ana', canceledBy: 'ana@acme.com' }]);
    ana.ws.close();
    bob.ws.close();
  });

  it("keeps a run routed to its client after a sub-workflow's onTaskEnd", async () => {
    const ana = await client('tok-ana');
    const bob = await client('tok-bob');
    ana.send('appRun', 'run-ana', { appIdentifier: 'app-1', pageId: 'home', runnable: 'submit', inputs: {} });
    await vi.waitFor(() => expect(core.runs).toEqual(['run-ana']));
    const bobGot: any[] = [];
    bob.ws.on('message', (raw: any) => bobGot.push(JSON.parse(raw.toString())));
    const anaGot: any[] = [];
    ana.ws.on('message', (raw: any) => anaGot.push(JSON.parse(raw.toString())));

    core.handlers.get('onTaskEnd')?.({ correlationId: 'run-ana', data: { pipelineIdentifier: 'child' } });
    core.handlers.get('onAction')?.({ correlationId: 'run-ana', data: { name: 'file.read' } });
    await vi.waitFor(() => expect(anaGot.map((m) => m.event)).toEqual(['onTaskEnd', 'onAction']));
    expect(bobGot).toEqual([]);
    ana.ws.close();
    bob.ws.close();
  });
});

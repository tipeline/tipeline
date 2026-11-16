import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const users: Record<string, any> = {
  'tok-editor': { id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' },
  'tok-viewer': { id: 'u-view', email: 'finance@acme.com', name: 'Fin', role: 'viewer' },
};
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: { validateToken: async (t: string) => users[t] ?? null },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: {
    getOwner: async (id: string) =>
      id === 'wf-private' ? { user_id: 'u-other', visibility: 'private' } : null,
    privateOwnedByOthers: async () => new Set(),
    claim: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: {
    start: vi.fn(),
    attachPipelineId: vi.fn(),
    complete: vi.fn(),
    getRequester: vi.fn(),
  },
}));
const auditLog = vi.fn(async () => {});
vi.mock('../src/audit/AuditLogService.js', () => ({
  AuditLogService: { log: (e: any) => auditLog(e) },
}));

import { WsGateway } from '../src/ws/WsGateway.js';

const ALERTS = [
  { id: 'a-traffic', taskIdentifier: 'wf-traffic', status: 'open', title: 'Traffic spike' },
  { id: 'a-hidden', taskIdentifier: 'wf-private', status: 'open', title: 'Secret' },
  { id: 'a-quiet', taskIdentifier: 'wf-traffic', status: 'dismissed', title: 'Acknowledged' },
];

/** Stands in for Core: answers the gateway's lookups and echoes forwarded commands. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  sent: { event: string; payload: any }[] = [];
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    if (event === 'alertList') return ALERTS;
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    this.sent.push({ event, payload });
    const resp = `on${event[0].toUpperCase()}${event.slice(1)}`;
    const data =
      event === 'alertList'
        ? ALERTS
        : event === 'alertDismiss'
          ? { dismissed: payload.payload.ids.length }
          : { reopened: true };
    setTimeout(() => this.handlers.get(resp)?.({ correlationId: payload.correlationId, data }));
  }
}

let server: http.Server;
let core: FakeCore;
let port: number;

beforeEach(async () => {
  auditLog.mockClear();
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
  let n = 0;
  const ask = (event: string, payload: any) =>
    new Promise<any>((resolve) => {
      const correlationId = `c-${++n}`;
      const onMsg = (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.correlationId === correlationId) {
          ws.off('message', onMsg);
          resolve(msg);
        }
      };
      ws.on('message', onMsg);
      ws.send(JSON.stringify({ event, correlationId, payload }));
    });
  return { ws, ask };
}

describe('WsGateway alerts', () => {
  it('lists only alerts from workflows this user can see', async () => {
    const { ws, ask } = await client('tok-viewer');
    const res = await ask('alertList', {});
    expect(res.data.map((a: any) => a.id)).toEqual(['a-traffic', 'a-quiet']);
    ws.close();
  });

  it('a viewer who can see an alert may dismiss it; recorded and audited as them', async () => {
    const { ws, ask } = await client('tok-viewer');
    const res = await ask('alertDismiss', { id: 'a-traffic', dismissedBy: 'spoof' });
    expect(res.error).toBeUndefined();
    expect(core.sent.at(-1)?.payload.payload).toEqual({
      ids: ['a-traffic'],
      dismissedBy: 'finance@acme.com',
    });
    await vi.waitFor(() => expect(auditLog).toHaveBeenCalled());
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'finance@acme.com',
        action: 'alert.dismiss',
        targetType: 'alert',
        targetId: 'a-traffic',
        metadata: { title: 'Traffic spike', workflow: 'wf-traffic' },
      })
    );
    ws.close();
  });

  it('dismiss all covers only the open alerts this user can see', async () => {
    const { ws, ask } = await client('tok-editor');
    await ask('alertDismiss', { all: true });
    expect(core.sent.at(-1)?.payload.payload).toEqual({
      ids: ['a-traffic'],
      dismissedBy: 'ed@acme.com',
    });
    ws.close();
  });

  it('a hidden alert is refused without reaching Core', async () => {
    const { ws, ask } = await client('tok-editor');
    const res = await ask('alertDismiss', { id: 'a-hidden' });
    expect(res.error).toBe('Alert not found');
    const reopen = await ask('alertReopen', { id: 'a-hidden' });
    expect(reopen.error).toBe('Alert not found');
    expect(core.sent.filter((s) => s.event !== 'alertList')).toEqual([]);
    expect(auditLog).not.toHaveBeenCalled();
    ws.close();
  });

  it('reopen is audited as alert.reopen', async () => {
    const { ws, ask } = await client('tok-editor');
    await ask('alertReopen', { id: 'a-quiet' });
    expect(core.sent.at(-1)?.payload.payload).toEqual({ id: 'a-quiet' });
    await vi.waitFor(() =>
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'alert.reopen' }))
    );
    ws.close();
  });
});

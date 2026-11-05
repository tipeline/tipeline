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
    getRequester: async (id: string) =>
      id === 'p-mine' ? { id: 'u-ed', email: 'ed@acme.com' } : null,
  },
}));
const auditLog = vi.fn(async () => {});
vi.mock('../src/audit/AuditLogService.js', () => ({
  AuditLogService: { log: (e: any) => auditLog(e) },
}));

import { WsGateway } from '../src/ws/WsGateway.js';

const PENDING = [
  { pipelineIdentifier: 'p-open', taskIdentifier: 'wf-pay', title: 'Pay?', approvers: null },
  {
    pipelineIdentifier: 'p-finance',
    taskIdentifier: 'wf-pay',
    title: 'Big pay?',
    approvers: ['finance@acme.com'],
  },
  {
    pipelineIdentifier: 'p-hidden',
    taskIdentifier: 'wf-private',
    title: 'Secret?',
    approvers: null,
  },
  {
    pipelineIdentifier: 'p-mine',
    taskIdentifier: 'wf-pay',
    title: 'My pay?',
    approvers: null,
    allowSelfApproval: false,
  },
];

/** Stands in for Core: answers the gateway's lookups and echoes forwarded commands. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  sent: { event: string; payload: any }[] = [];
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    if (event === 'approvalList' || event === 'appApprovalList') return PENDING;
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    this.sent.push({ event, payload });
    const resp = `on${event[0].toUpperCase()}${event.slice(1)}`;
    const data =
      event.endsWith('List') || event === 'approvalHistory'
        ? PENDING
        : { pipelineIdentifier: payload.payload.pipelineIdentifier };
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

describe('WsGateway approvals', () => {
  it('lists only visible approvals, each marked with whether this user may decide', async () => {
    const { ws, ask } = await client('tok-editor');
    const res = await ask('approvalList', {});
    expect(res.data.map((i: any) => [i.pipelineIdentifier, i.canDecide, i.blockedBy])).toEqual([
      ['p-open', true, null],
      ['p-finance', false, 'approvers'],
      ['p-mine', false, 'requester'],
    ]);
    ws.close();
  });

  it('sends decision history only to the asker, without private workflows of others', async () => {
    const { ws, ask } = await client('tok-editor');
    const res = await ask('approvalHistory', {});
    expect(res.data.map((i: any) => i.pipelineIdentifier)).toEqual([
      'p-open',
      'p-finance',
      'p-mine',
    ]);
    ws.close();
  });

  it('records the decision as the signed-in user, ignoring a name the client sends, and audits it', async () => {
    const { ws, ask } = await client('tok-editor');
    const res = await ask('approvalDecide', {
      pipelineIdentifier: 'p-open',
      approved: false,
      comment: 'no',
      decidedBy: 'someone@else.com',
    });

    expect(res.error).toBeUndefined();
    expect(core.sent.at(-1)).toEqual({
      event: 'approvalDecide',
      payload: {
        correlationId: 'c-1',
        payload: {
          pipelineIdentifier: 'p-open',
          approved: false,
          comment: 'no',
          decidedBy: 'ed@acme.com',
        },
      },
    });
    await vi.waitFor(() => expect(auditLog).toHaveBeenCalled());
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'ed@acme.com',
        action: 'approval.reject',
        targetId: 'p-open',
      })
    );
    ws.close();
  });

  it('refuses users the request does not name, and hidden runs, without reaching Core', async () => {
    const { ws, ask } = await client('tok-editor');
    const denied = await ask('approvalDecide', { pipelineIdentifier: 'p-finance', approved: true });
    expect(denied.error).toBe('Permission denied: only finance@acme.com can decide this approval');
    const hidden = await ask('approvalDecide', { pipelineIdentifier: 'p-hidden', approved: true });
    expect(hidden.error).toBe('Nothing is waiting for approval on this run');
    const own = await ask('approvalDecide', { pipelineIdentifier: 'p-mine', approved: true });
    expect(own.error).toBe(
      'Permission denied: you started this run, so someone else has to decide it'
    );
    expect(core.sent.filter((s) => s.event === 'approvalDecide')).toEqual([]);
    expect(auditLog).not.toHaveBeenCalled();
    ws.close();
  });

  it('lets a viewer named as approver decide through an app, recorded with their email', async () => {
    const { ws, ask } = await client('tok-viewer');
    const res = await ask('appApprovalDecide', {
      appIdentifier: 'app-1',
      pipelineIdentifier: 'p-finance',
      approved: true,
      actor: 'spoof',
    });
    expect(res.error).toBeUndefined();
    expect(core.sent.at(-1)?.payload.payload).toEqual({
      appIdentifier: 'app-1',
      pipelineIdentifier: 'p-finance',
      approved: true,
      comment: '',
      actor: 'finance@acme.com',
    });

    const other = await ask('appApprovalDecide', {
      appIdentifier: 'app-1',
      pipelineIdentifier: 'p-open',
      approved: true,
    });
    expect(other.error).toBe('Permission denied: only editors and admins can decide this approval');
    ws.close();
  });
});

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
    getOwner: async (id: string) =>
      id === 'wf-bob-private' ? { user_id: 'u-bob', user_email: 'bob@acme.com', visibility: 'private' } : null,
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
import { hideInProjectDetail, hideInProjectMap } from '../src/ws/hideWorkflows.js';

const sales = { identifier: 'p-sales', name: 'Sales', color: null };
const MAP = {
  live: {
    nodes: [
      { key: 'task:wf-shared', kind: 'workflow', name: 'Shared', ref: 'wf-shared', projects: [sales], inputs: ['a'], outputs: [] },
      {
        key: 'task:wf-bob-private',
        kind: 'helper',
        name: 'Bob only',
        ref: 'wf-bob-private',
        description: 'Secret plans',
        projects: [sales],
        inputs: ['token'],
        outputs: ['answer'],
        draft: true,
        lastSuccessAt: '2026-11-01T10:00:00.000Z',
      },
      { key: 'global:region', kind: 'global', name: 'region', ref: 'region', projects: [] },
    ],
    edges: [{ from: 'task:wf-bob-private', to: 'task:wf-shared', kind: 'calls' }],
  },
  plan: { nodes: [], edges: [] },
  candidates: [
    { key: 'task:wf-shared', kind: 'workflow', name: 'Shared', projects: ['Sales'] },
    { key: 'task:wf-bob-private', kind: 'helper', name: 'Bob only', projects: ['Sales'] },
  ],
};
const DETAIL = {
  identifier: 'p-sales',
  name: 'Sales',
  tasks: [
    { identifier: 'wf-shared', name: 'Shared' },
    { identifier: 'wf-bob-private', name: 'Bob only' },
  ],
  apps: [],
  shared_tasks: [{ identifier: 'wf-bob-private', name: 'Bob only', projects: [], apps: [] }],
};

/** Stands in for Core: answers projectMap and projectDetail with the data above. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    const answer =
      event === 'projectMap'
        ? ['onProjectMap', MAP]
        : event === 'projectDetail'
          ? ['onProjectDetail', DETAIL]
          : event === 'projectAssignTask'
            ? ['onProjectAssignTask', { identifier: payload.payload.taskIdentifier }]
            : null;
    if (answer) setTimeout(() => this.handlers.get(answer[0] as string)?.({ correlationId: payload.correlationId, data: answer[1] }));
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

async function ask(token: string, event: string, correlationId: string, payload: any = { identifier: 'p-sales' }) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: `Bearer ${token}` } });
  await new Promise((r) => ws.on('open', r));
  const msg = await new Promise<any>((resolve) => {
    ws.on('message', (raw: any) => {
      const parsed = JSON.parse(raw.toString());
      if (parsed.correlationId === correlationId) resolve(parsed);
    });
    ws.send(JSON.stringify({ event, correlationId, payload }));
  });
  ws.close();
  return msg;
}

describe('WsGateway projectMap', () => {
  it("shows another user's private workflow as a locked card, lines kept, and not as something to link", async () => {
    const res = await ask('tok-ana', 'projectMap', 'm-ana');
    expect(res.event).toBe('onProjectMap');
    const locked = res.data.live.nodes.find((n: any) => n.key === 'task:wf-bob-private');
    expect(locked).toEqual({
      key: 'task:wf-bob-private',
      kind: 'workflow',
      name: '',
      ref: '',
      description: null,
      projects: [sales],
      inputs: [],
      outputs: [],
      hidden: true,
    });
    expect(res.data.live.nodes.find((n: any) => n.key === 'task:wf-shared')).toEqual(MAP.live.nodes[0]);
    expect(res.data.live.edges).toEqual(MAP.live.edges);
    expect(res.data.candidates.map((c: any) => c.key)).toEqual(['task:wf-shared']);
  });

  it('shows admins everything', async () => {
    const res = await ask('tok-admin', 'projectMap', 'm-admin');
    expect(res.data).toEqual(MAP);
  });
});

describe('WsGateway projectDetail', () => {
  it("leaves out another user's private workflow", async () => {
    const res = await ask('tok-ana', 'projectDetail', 'd-ana');
    expect(res.data.tasks.map((t: any) => t.identifier)).toEqual(['wf-shared']);
    expect(res.data.shared_tasks).toEqual([]);
  });
});

describe('WsGateway projectAssignTask', () => {
  it("adds a workflow the user may see, but not another user's private one", async () => {
    const ok = await ask('tok-ana', 'projectAssignTask', 'a-1', { projectIdentifier: 'p-sales', taskIdentifier: 'wf-shared' });
    expect(ok.data).toEqual({ identifier: 'wf-shared' });
    const refused = await ask('tok-ana', 'projectAssignTask', 'a-2', { projectIdentifier: 'p-sales', taskIdentifier: 'wf-bob-private' });
    expect(refused.error).toBe('Workflow not found');
  });
});

describe('hideWorkflows', () => {
  it('leaves answers alone when nothing is hidden, or there is no answer', () => {
    expect(hideInProjectMap(MAP, new Set())).toBe(MAP);
    expect(hideInProjectMap(null, new Set(['x']))).toBeNull();
    expect(hideInProjectDetail(DETAIL, new Set())).toBe(DETAIL);
  });

  it('locks cards on the map of every project too (no candidates there)', () => {
    const all = { live: MAP.live, plans: {} };
    const out = hideInProjectMap(all, new Set(['wf-bob-private']));
    expect(out.plans).toEqual({});
    expect(out.live.nodes[1].hidden).toBe(true);
    expect(out.candidates).toBeUndefined();
  });
});

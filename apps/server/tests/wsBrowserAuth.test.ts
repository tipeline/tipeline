import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';

const users: Record<string, any> = {
  'tok-editor': { id: 'u-ed', email: 'ed@acme.com', name: 'Ed', role: 'editor' },
  'tok-viewer': { id: 'u-view', email: 'vi@acme.com', name: 'Vi', role: 'viewer' },
};
vi.mock('../src/auth/AuthService.js', () => ({
  AuthService: {
    validateToken: async (t: string) => {
      await new Promise((r) => setTimeout(r, 10));
      return users[t] ?? null;
    },
  },
}));
vi.mock('../src/ownership/TaskOwnershipService.js', () => ({
  TaskOwnershipService: { getOwner: async () => null, privateOwnedByOthers: async () => new Set(), claim: vi.fn(), remove: vi.fn() },
}));
vi.mock('../src/audit/PipelineAuditService.js', () => ({
  PipelineAuditService: { start: vi.fn(), attachPipelineId: vi.fn(), complete: vi.fn(), getRequester: async () => null },
}));
vi.mock('../src/audit/AuditLogService.js', () => ({
  AuditLogService: { log: vi.fn(async () => {}) },
}));

import { WsGateway } from '../src/ws/WsGateway.js';
import { chooseProtocol, tokenFromRequest } from '../src/ws/wsAuth.js';

/** Stands in for Core: answers every forwarded command. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    const resp = `on${event[0].toUpperCase()}${event.slice(1)}`;
    setTimeout(() => this.handlers.get(resp)?.({ correlationId: payload.correlationId, data: [] }));
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

/** Connects the way a browser does: no headers, the token as a subprotocol. */
function browserSocket(protocols: string[]) {
  return new WebSocket(`ws://127.0.0.1:${port}`, protocols);
}

describe('WsGateway sign-in from a browser', () => {
  it('accepts the token as a subprotocol and answers with "tipeline" only', async () => {
    const ws = browserSocket(['tipeline', 'bearer.tok-editor']);
    await new Promise((r) => ws.on('open', r));
    expect(ws.protocol).toBe('tipeline');

    const reply = await new Promise<any>((resolve) => {
      ws.on('message', (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.correlationId === 'c-1') resolve(msg);
      });
      ws.send(JSON.stringify({ event: 'taskList', correlationId: 'c-1', payload: {} }));
    });
    ws.close();
    expect(reply.event).toBe('onTaskList');
    expect(reply.error).toBeUndefined();
  });

  it('applies the same roles as a header token', async () => {
    const ws = browserSocket(['tipeline', 'bearer.tok-viewer']);
    await new Promise((r) => ws.on('open', r));
    const reply = await new Promise<any>((resolve) => {
      ws.on('message', (raw: any) => {
        const msg = JSON.parse(raw.toString());
        if (msg.correlationId === 'c-1') resolve(msg);
      });
      ws.send(JSON.stringify({ event: 'scheduleSet', correlationId: 'c-1', payload: {} }));
    });
    ws.close();
    expect(reply.error).toMatch(/viewers cannot run "scheduleSet"/);
  });

  it('closes the connection with 4001 for an unknown token', async () => {
    const ws = browserSocket(['tipeline', 'bearer.nope']);
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4001);
  });

  it('closes the connection with 4001 when no token is sent', async () => {
    const ws = browserSocket(['tipeline']);
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4001);
  });

  it('fails the handshake when the client does not ask for "tipeline"', async () => {
    const ws = browserSocket(['bearer.tok-editor']);
    const failed = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(false));
      ws.on('error', () => resolve(true));
    });
    expect(failed).toBe(true);
  });

  it('still accepts the Authorization header (Desktop and the CLI)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: 'Bearer tok-editor' } });
    await new Promise((r) => ws.on('open', r));
    expect(ws.protocol).toBe('');
    ws.close();
  });
});

describe('tokenFromRequest', () => {
  const req = (headers: Record<string, string>) => ({ headers }) as any;

  it('prefers the Authorization header', () => {
    expect(tokenFromRequest(req({ authorization: 'Bearer abc', 'sec-websocket-protocol': 'tipeline, bearer.xyz' }))).toBe('abc');
  });

  it('reads a bearer subprotocol in any position', () => {
    expect(tokenFromRequest(req({ 'sec-websocket-protocol': 'bearer.xyz, tipeline' }))).toBe('xyz');
    expect(tokenFromRequest(req({ 'sec-websocket-protocol': 'tipeline,bearer.xyz' }))).toBe('xyz');
  });

  it('returns null for an empty or missing token', () => {
    expect(tokenFromRequest(req({}))).toBeNull();
    expect(tokenFromRequest(req({ authorization: 'Bearer ' }))).toBeNull();
    expect(tokenFromRequest(req({ 'sec-websocket-protocol': 'tipeline, bearer.' }))).toBeNull();
    expect(tokenFromRequest(req({ authorization: 'Basic abc' }))).toBeNull();
  });
});

describe('chooseProtocol', () => {
  it('never answers with the bearer protocol', () => {
    expect(chooseProtocol(new Set(['tipeline', 'bearer.xyz']))).toBe('tipeline');
    expect(chooseProtocol(new Set(['bearer.xyz']))).toBe(false);
  });
});

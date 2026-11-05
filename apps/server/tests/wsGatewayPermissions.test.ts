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
  AuthService: {
    validateToken: async (t: string) => {
      // A real check reads the database, so it finishes after the client's first message arrives.
      await new Promise((r) => setTimeout(r, 30));
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

/** Stands in for Core: records forwarded commands and answers each one. */
class FakeCore {
  handlers = new Map<string, (data: any) => void>();
  sent: string[] = [];
  answers: Record<string, unknown> = {};
  on(event: string, handler: (data: any) => void) {
    this.handlers.set(event, handler);
  }
  async request(event: string) {
    throw new Error(`unexpected request ${event}`);
  }
  send(event: string, payload: any) {
    this.sent.push(event);
    const resp = `on${event[0].toUpperCase()}${event.slice(1)}`;
    setTimeout(() => this.handlers.get(resp)?.({ correlationId: payload.correlationId, data: this.answers[event] ?? { ok: true } }));
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

describe('WsGateway messages sent right away', () => {
  const connectAndSend = (token: string, send: any[]) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: `Bearer ${token}` } });
    ws.on('open', () => send.forEach((message) => ws.send(JSON.stringify(message))));
    return ws;
  };

  it('answers a message sent as soon as the connection opens, in order', async () => {
    const ws = connectAndSend('tok-admin', [
      { event: 'status', correlationId: 'first' },
      { event: 'status', correlationId: 'second' },
    ]);
    const replies: string[] = [];
    await new Promise<void>((resolve) => {
      ws.on('message', (raw: any) => {
        replies.push(JSON.parse(raw.toString()).correlationId);
        if (replies.length === 2) resolve();
      });
    });
    ws.close();
    expect(replies).toEqual(['first', 'second']);
  });

  it('still forwards nothing for a bad token', async () => {
    const ws = connectAndSend('tok-nobody', [{ event: 'status', correlationId: 'c-1' }]);
    const code = await new Promise((resolve) => ws.on('close', resolve));
    await new Promise((r) => setTimeout(r, 30));
    expect(code).toBe(4001);
    expect(core.sent).toEqual([]);
  });
});

describe('WsGateway keeps credentials from those who may not see them', () => {
  const SECRET_SOURCE = {
    name: 'wf',
    pipeline: {
      variables: [
        { name: 'pw', type: 'string', secret: true, value: 'hunter2' },
        { name: 'open', type: 'string', value: 'hello' },
      ],
    },
  };
  const VARIABLES = [
    { name: 'apiKey', secret: 1, value: 'global-secret' },
    { name: 'region', secret: 0, value: 'eu' },
  ];

  it.each(['settingsGetApiToken', 'connectionList', 'connectionGetActive', 'connectionSetActive'])(
    'lets only an admin run %s',
    async (event) => {
      core.answers[event] = 'core-token';
      for (const token of ['tok-viewer', 'tok-editor']) {
        const denied = await ask(token, event);
        expect(denied.error).toContain('Permission denied');
        expect(denied.data).toBeUndefined();
      }
      expect(core.sent).toEqual([]);
      expect((await ask('tok-admin', event)).data).toBe('core-token');
    }
  );

  it('gives settings without credentials to all but an admin', async () => {
    core.answers.settingsList = {
      language: 'es',
      defaultAuthor: 'Ana',
      agent_provider: 'deepseek',
      agent_deepseek_api_key: 'sk-real',
      agent_mcp_token: 'mcp-real',
    };
    const safe = { language: 'es', defaultAuthor: 'Ana', agent_provider: 'deepseek' };
    expect((await ask('tok-viewer', 'settingsList')).data).toEqual(safe);
    expect((await ask('tok-editor', 'settingsList')).data).toEqual(safe);
    expect((await ask('tok-admin', 'settingsList')).data.agent_deepseek_api_key).toBe('sk-real');
  });

  it('blanks secret variables for a viewer, but not an editor who edits them', async () => {
    core.answers.variableList = VARIABLES;
    expect((await ask('tok-viewer', 'variableList')).data).toEqual([
      { name: 'apiKey', secret: 1, value: null },
      { name: 'region', secret: 0, value: 'eu' },
    ]);
    expect((await ask('tok-editor', 'variableList')).data).toEqual(VARIABLES);
  });

  it('blanks secrets typed into a workflow for a viewer, in the workflow and its versions', async () => {
    core.answers.taskDetail = { identifier: 'wf', source: JSON.stringify(SECRET_SOURCE) };
    core.answers.taskRevisionDetail = { id: 1, source: JSON.stringify(SECRET_SOURCE) };

    const detail = await ask('tok-viewer', 'taskDetail', { identifier: 'wf' });
    expect(detail.data.source).not.toContain('hunter2');
    expect(detail.data.source).toContain('hello');

    const revision = await ask('tok-viewer', 'taskRevisionDetail', { identifier: 'wf' });
    expect(JSON.stringify(revision.data)).not.toContain('hunter2');

    const editor = await ask('tok-editor', 'taskDetail', { identifier: 'wf' });
    expect(editor.data.source).toContain('hunter2');
  });

  it('only answers the one who asked', async () => {
    core.answers.settingsList = { agent_deepseek_api_key: 'sk-real', language: 'es' };
    const other = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { authorization: 'Bearer tok-viewer' } });
    const heard: string[] = [];
    other.on('message', (raw: any) => heard.push(raw.toString()));
    await new Promise((r) => other.on('open', r));
    await new Promise((r) => setTimeout(r, 40));
    await ask('tok-admin', 'settingsList');
    await new Promise((r) => setTimeout(r, 20));
    other.close();
    expect(heard).toEqual([]);
  });
});

describe('WsGateway permission checks', () => {
  it.each(['fullBackup', 'fullRestore'])('lets only an admin run %s', async (event) => {
    const denied = await ask('tok-editor', event);
    expect(denied).toEqual({
      event: `on${event[0].toUpperCase()}${event.slice(1)}`,
      correlationId: 'c-1',
      error: `Permission denied: "${event}" requires an admin.`,
    });
    expect(core.sent).toEqual([]);

    const allowed = await ask('tok-admin', event);
    expect(allowed.data).toEqual({ ok: true });
    expect(core.sent).toEqual([event]);
  });

  it('answers a viewer refusal on the response event, so the request fails at once', async () => {
    const denied = await ask('tok-viewer', 'variableNew');
    expect(denied).toEqual({
      event: 'onVariableNew',
      correlationId: 'c-1',
      error: 'Permission denied: viewers cannot run "variableNew"',
    });
    expect(core.sent).toEqual([]);
  });
});

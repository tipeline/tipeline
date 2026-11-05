import { describe, expect, it, vi } from 'vitest';
import { authorizeAppCommand, visibleAppWorkflows } from '../src/ws/appAuthorization.js';

const source = JSON.stringify({
  schemaVersion: 2,
  workflows: { list: { identifier: 'wf-private' }, open: { identifier: 'wf-public' } },
  pages: [
    {
      id: 'main',
      runnables: {
        load: { mode: 'run', workflow: 'list' },
        other: { mode: 'run', workflow: 'open' },
      },
    },
  ],
});

const owners: Record<string, { user_id: string; visibility: string }> = {
  'wf-private': { user_id: 'alice', visibility: 'private' },
  'wf-public': { user_id: 'alice', visibility: 'public' },
};

const deps = {
  getApp: vi.fn(async (id: string) => (id === 'app-1' ? { name: 'Invoices', source } : null)),
  getOwner: vi.fn(async (id: string) => owners[id] ?? null),
};

const bob = { id: 'bob', role: 'editor' };
const alice = { id: 'alice', role: 'editor' };
const admin = { id: 'root', role: 'admin' };
const run = (runnable: string) => ({ appIdentifier: 'app-1', pageId: 'main', runnable });

describe('authorizeAppCommand', () => {
  it("hides another user's private workflow behind an app runnable", async () => {
    expect(await authorizeAppCommand('appRun', run('load'), bob, deps)).toEqual({
      allowed: false,
      error: 'Workflow not found',
    });
    expect(await authorizeAppCommand('appHistoryFetch', run('load'), bob, deps)).toEqual({
      allowed: false,
      error: 'Workflow not found',
    });
  });

  it('lets the owner, admins, and anyone for public workflows through — with the resolved workflow', async () => {
    expect(await authorizeAppCommand('appRun', run('load'), alice, deps)).toEqual({
      allowed: true,
      taskIdentifier: 'wf-private',
      appName: 'Invoices',
    });
    expect(await authorizeAppCommand('appRun', run('load'), admin, deps)).toMatchObject({
      allowed: true,
    });
    expect(await authorizeAppCommand('appRun', run('other'), bob, deps)).toEqual({
      allowed: true,
      taskIdentifier: 'wf-public',
      appName: 'Invoices',
    });
  });

  it('rejects unknown apps, pages and runnables', async () => {
    expect(
      await authorizeAppCommand('appRun', { ...run('load'), appIdentifier: 'nope' }, alice, deps)
    ).toEqual({ allowed: false, error: 'App not found' });
    expect(
      await authorizeAppCommand('appRun', { ...run('load'), pageId: 'nope' }, alice, deps)
    ).toEqual({ allowed: false, error: 'App not found' });
    expect(await authorizeAppCommand('appRun', run('nope'), alice, deps)).toEqual({
      allowed: false,
      error: 'App not found',
    });
    expect(await authorizeAppCommand('appRun', {}, alice, deps)).toEqual({
      allowed: false,
      error: 'App not found',
    });
  });

  it('gates tableDataFetch on its taskIdentifier', async () => {
    expect(
      await authorizeAppCommand('tableDataFetch', { taskIdentifier: 'wf-private' }, bob, deps)
    ).toEqual({ allowed: false, error: 'Workflow not found' });
    expect(
      await authorizeAppCommand('tableDataFetch', { taskIdentifier: 'wf-private' }, alice, deps)
    ).toEqual({ allowed: true });
    expect(
      await authorizeAppCommand('tableDataFetch', { taskIdentifier: 'unowned' }, bob, deps)
    ).toEqual({ allowed: true });
  });

  it('treats a broken stored source as not found', async () => {
    const broken = { ...deps, getApp: async () => ({ name: 'X', source: '{not json' }) };
    expect(await authorizeAppCommand('appRun', run('load'), alice, broken)).toEqual({
      allowed: false,
      error: 'App not found',
    });
  });
});

describe('visibleAppWorkflows (appRunsList)', () => {
  it("leaves out another user's private workflows; owners and admins see all", async () => {
    expect(await visibleAppWorkflows({ appIdentifier: 'app-1' }, bob, deps)).toEqual({ aliases: ['open'], appName: 'Invoices' });
    expect(await visibleAppWorkflows({ appIdentifier: 'app-1' }, alice, deps)).toEqual({ aliases: ['list', 'open'], appName: 'Invoices' });
    expect(await visibleAppWorkflows({ appIdentifier: 'app-1' }, admin, deps)).toEqual({ aliases: ['list', 'open'], appName: 'Invoices' });
  });

  it('narrows the aliases asked for; unknown aliases and apps go', async () => {
    expect(await visibleAppWorkflows({ appIdentifier: 'app-1', workflows: ['list', 'ghost'] }, bob, deps)).toEqual({ aliases: [], appName: 'Invoices' });
    expect(await visibleAppWorkflows({ appIdentifier: 'nope' }, bob, deps)).toBeNull();
  });
});

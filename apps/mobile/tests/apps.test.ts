import { describe, expect, it, vi } from 'vitest';
import { phoneLayout } from '../src/apps/phoneLayout';
import { createDesktopBridge } from '../src/apps/desktopBridge';

const item = (id: string, x: number, y: number, w: number, h = 10) => ({ id, layout: { x, y, w, h } });

describe('phoneLayout', () => {
  it('stacks components in reading order, full width', () => {
    const cells = phoneLayout([item('table', 0, 20, 12), item('chart', 6, 0, 6), item('text', 0, 0, 6)]);
    expect(cells.map((c) => [c.item.id, c.half])).toEqual([
      ['text', false],
      ['chart', false],
      ['table', false],
    ]);
  });

  it('pairs small components that sat side by side', () => {
    const kpis = [item('a', 0, 0, 3), item('b', 3, 0, 3), item('c', 6, 0, 3), item('d', 9, 0, 3), item('table', 0, 10, 12)];
    expect(phoneLayout(kpis).map((c) => [c.item.id, c.half])).toEqual([
      ['a', true],
      ['b', true],
      ['c', true],
      ['d', true],
      ['table', false],
    ]);
  });

  it('keeps a small one alone when its neighbour is wide or on another row', () => {
    expect(phoneLayout([item('kpi', 0, 0, 4), item('wide', 4, 0, 8)]).map((c) => c.half)).toEqual([false, false]);
    expect(phoneLayout([item('a', 0, 0, 3, 10), item('b', 0, 10, 3, 10)]).map((c) => c.half)).toEqual([false, false]);
  });
});

/** A stand-in for @tipeline/client: records requests and lets a test play a run's events. */
function fakeClient() {
  const subscribers = new Set<(m: any) => void>();
  const runs: Array<{ command: string; payload: any; onEvent: (e: any) => void; correlationId?: string; reject: (e: Error) => void }> = [];
  const client = {
    request: vi.fn(async (command: string, payload: any) => ({ command, payload })),
    run: vi.fn((command: string, payload: any, onEvent: (e: any) => void, options: { correlationId?: string } = {}) => {
      let reject!: (e: Error) => void;
      const done = new Promise((_, rej) => (reject = rej));
      done.catch(() => {});
      runs.push({ command, payload, onEvent, correlationId: options.correlationId, reject });
      return { correlationId: options.correlationId ?? 'x', stopListening() {}, done };
    }),
    subscribe: (fn: (m: any) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    broadcast: (m: any) => subscribers.forEach((fn) => fn(m)),
    runs,
  };
  return client;
}

describe('the Desktop bridge on a phone', () => {
  const options = { openUrl: vi.fn(), notify: vi.fn(), computerOnly: 'Needs the computer' };

  it("sends Desktop's channels to the Server as commands, with their payload", async () => {
    const client = fakeClient();
    const bridge = createDesktopBridge(() => client as any, options);
    expect(await bridge.invoke('appDetail', { correlationId: 'c1', payload: { identifier: 'app-1' } })).toEqual({
      command: 'appDetail',
      payload: { identifier: 'app-1' },
    });
  });

  it("runs an app runnable under the runtime's own id and repeats its events where Desktop's main would", () => {
    const client = fakeClient();
    const bridge = createDesktopBridge(() => client as any, options);
    const own = vi.fn();
    const all = vi.fn();
    bridge.on('stream:run-7', own);
    bridge.on('stream:broadcast', all);

    bridge.send('appRun', { correlationId: 'run-7', payload: { runnable: 'records' } });
    expect(client.runs[0]).toMatchObject({ command: 'appRun', payload: { runnable: 'records' }, correlationId: 'run-7' });

    client.runs[0].onEvent({ type: 'end_all', event: 'onTaskEndAll', data: { outputs: { n: 1 } } });
    expect(own).toHaveBeenCalledWith(null, expect.objectContaining({ type: 'end_all', correlationId: 'run-7', data: { outputs: { n: 1 } } }));
    expect(all).toHaveBeenCalledTimes(1);
  });

  it("passes on other people's runs the Server announces, but not its own twice", () => {
    const client = fakeClient();
    const bridge = createDesktopBridge(() => client as any, options);
    const all = vi.fn();
    bridge.on('stream:broadcast', all);
    bridge.send('appRun', { correlationId: 'mine', payload: {} });

    client.broadcast({ event: 'onTaskStart', correlationId: 'schedule-1', data: { pipelineIdentifier: 'p' } });
    client.broadcast({ event: 'onTaskStart', correlationId: 'mine', data: {} });
    client.broadcast({ event: 'onTaskList', correlationId: 'q', data: [] });
    expect(all.mock.calls.map((c) => [c[1].type, c[1].correlationId])).toEqual([['start', 'schedule-1']]);
  });

  it('tells a waiting page when the connection drops mid-run', async () => {
    const client = fakeClient();
    const bridge = createDesktopBridge(() => client as any, options);
    const own = vi.fn();
    bridge.on('stream:r', own);
    bridge.send('appRun', { correlationId: 'r', payload: {} });
    client.runs[0].reject(new Error('Connection lost'));
    await vi.waitFor(() => expect(own).toHaveBeenCalledWith(null, { type: 'error', correlationId: 'r', error: 'Connection lost' }));
  });

  it("opens web links in the phone's browser, and refuses the desktop computer's files", async () => {
    const client = fakeClient();
    const bridge = createDesktopBridge(() => client as any, options);
    expect(await bridge.invoke('app:open-url', { url: 'https://example.com/x' })).toEqual({ ok: true });
    expect(options.openUrl).toHaveBeenCalledWith('https://example.com/x');
    expect(await bridge.invoke('app:open-url', { url: 'file:///etc/passwd' })).toMatchObject({ ok: false });
    // Answered the way Desktop's main process answers a file it may not use.
    expect(await bridge.invoke('app:read-file', { path: '/tmp/a.png' })).toEqual({ ok: false, error: 'desktopOnly' });
    expect(await bridge.invoke('app:media-check', { path: '/tmp/a.mp4' })).toEqual({ ok: false, error: 'desktopOnly' });
    expect(await bridge.invoke('app:file-trust:get', { appIdentifier: 'a' })).toBe(false);
    // A file picker picks nothing and says why.
    expect(await bridge.invoke('dialog:open-file', {})).toBeNull();
    expect(options.notify).toHaveBeenCalledWith('Needs the computer');
    expect(client.request).not.toHaveBeenCalled();
  });
});

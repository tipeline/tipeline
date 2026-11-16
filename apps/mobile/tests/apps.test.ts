import { describe, expect, it, vi } from 'vitest';
import { packPhoneLayouts, phoneLayouts } from '@tipeline/schemas';
import { createDesktopBridge } from '../src/apps/desktopBridge';

type Mobile = { hidden?: boolean; layout?: { x: number; y: number; w: number; h: number } };
const item = (id: string, x: number, y: number, w: number, h = 10, mobile?: Mobile) => ({
  id,
  layout: { x, y, w, h },
  ...(mobile ? { mobile } : {}),
});
const places = (items: ReturnType<typeof item>[]) =>
  phoneLayouts(items).map((p) => [p.item.id, p.layout.x, p.layout.y, p.layout.w, p.layout.h]);

describe('phoneLayouts', () => {
  it('stacks components in reading order, full width', () => {
    expect(places([item('table', 0, 20, 12), item('chart', 6, 0, 6), item('text', 0, 0, 6)])).toEqual([
      ['text', 0, 0, 4, 10],
      ['chart', 0, 10, 4, 10],
      ['table', 0, 20, 4, 10],
    ]);
  });

  it('pairs small components that sat side by side, a pair as tall as its taller one', () => {
    const kpis = [item('a', 0, 0, 3, 8), item('b', 3, 0, 3, 12), item('c', 6, 0, 3), item('d', 9, 0, 3), item('table', 0, 12, 12)];
    expect(places(kpis)).toEqual([
      ['a', 0, 0, 2, 12],
      ['b', 2, 0, 2, 12],
      ['c', 0, 12, 2, 10],
      ['d', 2, 12, 2, 10],
      ['table', 0, 22, 4, 10],
    ]);
  });

  it('keeps a small one alone when its neighbour is wide or on another row', () => {
    expect(places([item('kpi', 0, 0, 4), item('wide', 4, 0, 8)]).map((p) => p[3])).toEqual([4, 4]);
    expect(places([item('a', 0, 0, 3, 10), item('b', 0, 10, 3, 10)]).map((p) => p[3])).toEqual([4, 4]);
  });

  it('leaves out components hidden on phones', () => {
    expect(places([item('a', 0, 0, 6), item('help', 6, 0, 6, 10, { hidden: true }), item('b', 0, 10, 12)])).toEqual([
      ['a', 0, 0, 4, 10],
      ['b', 0, 10, 4, 10],
    ]);
  });

  it('keeps placed components where the builder put them, the rest below them', () => {
    const items = [
      item('chart', 0, 0, 12, 20, { layout: { x: 0, y: 6, w: 4, h: 20 } }),
      item('kpi', 0, 20, 3, 6, { layout: { x: 0, y: 0, w: 4, h: 6 } }),
      item('added', 0, 30, 12, 8),
    ];
    expect(phoneLayouts(items).map((p) => [p.item.id, p.layout.y, p.placed])).toEqual([
      ['kpi', 0, true],
      ['chart', 6, true],
      ['added', 26, false],
    ]);
  });
});

describe('packPhoneLayouts', () => {
  it('fills rows left to right and starts a new row when the next does not fit', () => {
    expect(packPhoneLayouts([{ id: 'a', w: 2, h: 6 }, { id: 'b', w: 2, h: 8 }, { id: 'c', w: 3, h: 4 }, { id: 'd', w: 9, h: 5 }])).toEqual([
      { id: 'a', x: 0, y: 0, w: 2, h: 6 },
      { id: 'b', x: 2, y: 0, w: 2, h: 8 },
      { id: 'c', x: 0, y: 8, w: 3, h: 4 },
      { id: 'd', x: 0, y: 12, w: 4, h: 5 },
    ]);
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

import net from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IPCModule } from 'node-ipc';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IpcTransport } from '@engine/IpcTransport';

// Real node-ipc: the crash this guards against is thrown inside its socket callback.
describe('IpcTransport with bad messages', () => {
  const ipc = new (IPCModule as any)();
  const socketRoot = `${mkdtempSync(join(tmpdir(), 'tl-ipc-'))}/`;
  const socketPath = `${socketRoot}app.test_core`;
  const fatal = vi.fn();
  const handled = vi.fn();
  let transport: IpcTransport;

  beforeAll(async () => {
    ipc.config.id = 'test_core';
    ipc.config.appspace = 'app.';
    ipc.config.socketRoot = socketRoot;
    ipc.config.silent = true;
    process.on('uncaughtException', fatal);
    process.on('unhandledRejection', fatal);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    transport = new IpcTransport(ipc, 'secret');
    await new Promise<void>((resolve) => {
      ipc.serve(socketPath, () => {
        transport.attach();
        transport.on('ping', (message) => handled(message));
        transport.on('throws', (message) => handled(message.correlationId));
        transport.on('rejects', async (message) => handled(message.correlationId));
        resolve();
      });
      ipc.server.start();
    });
  });

  afterAll(() => {
    ipc.server.stop();
    process.off('uncaughtException', fatal);
    process.off('unhandledRejection', fatal);
    vi.restoreAllMocks();
    rmSync(socketRoot, { recursive: true, force: true });
  });

  /** Sends raw frames on one connection, the way node-ipc's parser reads them. */
  async function send(...messages: object[]) {
    const socket = net.connect(socketPath);
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(messages.map((m) => `${JSON.stringify(m)}\f`).join(''));
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.destroy();
  }

  const authenticate = { type: 'authenticate', data: { token: 'secret' } };

  it('ignores a message with no event name, and carries on', async () => {
    await send({ data: { correlationId: 'x' } }, authenticate, { type: 'ping', data: { ok: true } });
    expect(fatal).not.toHaveBeenCalled();
    expect(handled).toHaveBeenCalledWith({ ok: true });
  });

  it('survives a handler that throws on a message with no data', async () => {
    await send(authenticate, { type: 'throws' }, { type: 'rejects' });
    expect(fatal).not.toHaveBeenCalled();
  });
});

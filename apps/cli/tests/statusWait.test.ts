import { mkdirSync, rmSync } from 'node:fs';
import { IPCModule } from 'node-ipc';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A real node-ipc socket, because how long the CLI stays silent depends on how connections fail.
// Only the pid check is faked: a real one needs a process running Core's Server.js.
const { socketRoot, runningCorePid } = vi.hoisted(() => {
  const root = `${process.env.TMPDIR ?? '/tmp/'}tl-cli-status-${process.pid}/`;
  process.env.TIPELINE_IPC_SOCKET_ROOT = root;
  return { socketRoot: root, runningCorePid: vi.fn() };
});

vi.mock('@tipeline/utils/coreProcess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tipeline/utils/coreProcess')>()),
  runningCorePid,
}));
vi.mock('../src/Printer', () => ({
  default: { printMessage: vi.fn(), printError: vi.fn(), printStatus: vi.fn() },
}));

import CommandService from '../src/CommandService';
import Printer from '../src/Printer';

/** Waits for the CLI's first process.exit and returns the code. */
function exitCode() {
  return new Promise<number | undefined>((resolve) => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => resolve(code)) as any);
  });
}

describe('tipeline status', () => {
  let waiting: ReturnType<typeof vi.spyOn>;

  beforeAll(() => mkdirSync(socketRoot, { recursive: true }));
  afterAll(() => rmSync(socketRoot, { recursive: true, force: true }));

  beforeEach(() => {
    vi.clearAllMocks();
    waiting = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('says Core is not running after one attempt when no Core process exists', async () => {
    runningCorePid.mockReturnValue(null);
    const exited = exitCode();
    const started = Date.now();

    CommandService.status();

    expect(await exited).toBe(1);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(vi.mocked(Printer.printError).mock.calls[0][0]).toContain('not running');
    expect(waiting).not.toHaveBeenCalled();
  });

  it('says it is waiting once, then reports a Core that never answers', async () => {
    runningCorePid.mockReturnValue(4242);
    const exited = exitCode();

    CommandService.status(3);

    expect(await exited).toBe(1);
    expect(waiting).toHaveBeenCalledTimes(1);
    expect(waiting.mock.calls[0][0]).toContain('Waiting');
    expect(vi.mocked(Printer.printError).mock.calls[0][0]).toContain('PID 4242');
  }, 15000);

  it('shows the status once a starting Core opens its socket', async () => {
    runningCorePid.mockReturnValue(4242);
    const core = new (IPCModule as any)();
    core.config.id = 'tipeline_core';
    core.config.socketRoot = socketRoot;
    core.config.silent = true;
    const exited = exitCode();

    CommandService.status();

    await vi.waitFor(() => expect(waiting).toHaveBeenCalledTimes(1), { timeout: 5000 });
    core.serve(() => {
      core.server.on('connectionGetActive', (data: any, socket: any) =>
        core.server.emit(socket, 'onConnectionGetActive', {
          success: true,
          data: { connection: null },
          correlationId: data?.correlationId,
        })
      );
      core.server.on('status', (_: unknown, socket: any) =>
        core.server.emit(socket, 'onStatus', {
          success: true,
          data: { status: 'running', pid: 4242, uptime: 1 },
        })
      );
    });
    core.server.start();

    expect(await exited).toBe(0);
    expect(Printer.printStatus).toHaveBeenCalledTimes(1);
    expect(waiting).toHaveBeenCalledTimes(1);
    core.server.stop();
  }, 15000);
});

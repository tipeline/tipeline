import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { IpcClient } from '../electron/main/utils/IpcClient';

// A real node-ipc server in a real process that really dies: this is about what node-ipc
// keeps when it reconnects, so faking it would prove nothing.
const nodeIpcPath = createRequire(import.meta.url)
  .resolve('node-ipc')
  .replace(/\.cjs$/, '.js');
const socketRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ipc-'));
const serverScript = path.join(socketRoot, 'server.mjs');
fs.writeFileSync(
  serverScript,
  `import ipc from ${JSON.stringify(nodeIpcPath)};
ipc.config.id = 'tipeline_core';
ipc.config.socketRoot = ${JSON.stringify(`${socketRoot}/`)};
ipc.config.silent = true;
ipc.serve(() => ipc.server.on('authenticate', (_, socket) => ipc.server.emit(socket, 'ping', {})));
ipc.server.start();`
);

let server: ChildProcess | null = null;

function startServer() {
  server = spawn(process.execPath, [serverScript], { stdio: 'ignore' });
}

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++)
    await new Promise((r) => setTimeout(r, 50));
};

afterEach(() => {
  server?.kill('SIGKILL');
  delete process.env.TIPELINE_IPC_SOCKET_ROOT;
  fs.rmSync(socketRoot, { recursive: true, force: true });
});

describe('IpcClient reconnect', () => {
  it('fires each listener once after Core restarts', async () => {
    process.env.TIPELINE_IPC_SOCKET_ROOT = `${socketRoot}/`;
    startServer();

    let pings = 0;
    let disconnects = 0;
    let reconnects = 0;
    await IpcClient.init(
      { ping: () => pings++ },
      () => disconnects++,
      () => reconnects++
    );
    await waitFor(() => pings === 1);
    expect(pings).toBe(1);
    expect(reconnects).toBe(0);

    server!.kill('SIGKILL');
    await waitFor(() => disconnects === 1);
    expect(disconnects).toBe(1);

    pings = 0;
    startServer();
    await waitFor(() => pings > 0);
    await new Promise((r) => setTimeout(r, 300));
    expect(pings).toBe(1);
    expect(reconnects).toBe(1);
  }, 20_000);
});

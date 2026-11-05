import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipcConfig: Record<string, unknown> = {};

vi.mock('node-ipc', () => ({ default: { config: ipcConfig, connectTo: vi.fn(), disconnect: vi.fn() } }));
vi.mock('@tipeline/agent', () => ({
  McpClient: class {},
  createProvider: vi.fn(),
  runAgentPrompt: vi.fn(),
  PROVIDERS: [],
}));

describe('IPC socket root', () => {
  beforeEach(() => {
    vi.resetModules();
    delete ipcConfig.socketRoot;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses TIPELINE_IPC_SOCKET_ROOT when it is set', async () => {
    vi.stubEnv('TIPELINE_IPC_SOCKET_ROOT', '/tmp/tipeline/');
    await import('../src/CommandService');
    expect(ipcConfig.socketRoot).toBe('/tmp/tipeline/');
  });

  it('keeps the node-ipc default when it is not set', async () => {
    vi.stubEnv('TIPELINE_IPC_SOCKET_ROOT', '');
    await import('../src/CommandService');
    expect(ipcConfig.socketRoot).toBeUndefined();
  });
});

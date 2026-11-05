import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pid: null as number | null,
  socket: false,
  marker: '',
  status: vi.fn(),
  stop: vi.fn(),
  spawned: vi.fn(),
}));

vi.mock('electron', () => ({ app: { isPackaged: true } }));
vi.mock('node:child_process', () => ({
  spawn: () => {
    state.spawned();
    return { on: vi.fn(), unref: vi.fn() };
  },
}));
vi.mock('node:net', () => ({
  default: {
    connect: () => {
      const handlers: Record<string, () => void> = {};
      const socket = {
        once: (event: string, handler: () => void) => ((handlers[event] = handler), socket),
        setTimeout: () => socket,
        destroy: () => {},
      };
      setTimeout(() => handlers[state.socket ? 'connect' : 'error']?.(), 0);
      return socket;
    },
  },
}));
vi.mock('@tipeline/utils', () => ({ generateIdentifier: () => 'id', isOlderVersion: () => false }));
vi.mock('@tipeline/utils/coreProcess', () => ({
  runningCorePid: () => state.pid,
  newerDatabaseMarker: () => state.marker,
}));
vi.mock('@tipeline/utils/coreService', () => ({
  coreServiceIsDesktop: () => true,
  coreServiceMatches: () => true,
  coreServiceSupport: () => ({ available: false, restartsOnCrash: false }),
  installCoreService: vi.fn(),
  isCoreServiceInstalled: () => false,
  resolveOnPath: (name: string) => name,
  startCoreService: vi.fn(),
  uninstallCoreService: vi.fn(),
}));
vi.mock('../electron/main/utils/CoreService', () => ({
  CoreService: {
    localRequest: (channel: string) => (channel === 'stop' ? state.stop() : state.status()),
  },
}));
vi.mock('../electron/main/utils/ipc-channels', () => ({ CORE: { STATUS: 'status', STOP: 'stop' } }));

const OWN_CORE = path.join('/resources', 'core', 'dist', 'engine', 'Server.js');

describe('CoreLauncher', () => {
  let folder: string;

  beforeEach(() => {
    vi.clearAllMocks();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'core-launcher-'));
    state.marker = path.join(folder, 'marker');
    state.pid = 42;
    state.socket = true;
    (process as any).resourcesPath = '/resources';
    state.stop.mockImplementation(async () => {
      state.pid = null;
      state.socket = false;
    });
  });

  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  describe('stopCoreForUpdate', () => {
    async function stop() {
      const { stopCoreForUpdate } = await import('../electron/main/utils/CoreLauncher');
      return stopCoreForUpdate();
    }

    it('has nothing to do when no Core is running', async () => {
      state.pid = null;
      state.socket = false;
      expect(await stop()).toEqual({ ready: true });
      expect(state.status).not.toHaveBeenCalled();
    });

    it('leaves a Core that runs from somewhere else, which the update does not replace', async () => {
      state.status.mockResolvedValue({ entry: '/usr/lib/cli/Server.js', activeRuns: 3 });
      expect(await stop()).toEqual({ ready: true });
      expect(state.stop).not.toHaveBeenCalled();
    });

    it('stops its own idle Core', async () => {
      state.status.mockResolvedValue({ entry: OWN_CORE, activeRuns: 0 });
      expect(await stop()).toEqual({ ready: true });
      expect(state.stop).toHaveBeenCalledOnce();
    });

    it('does not interrupt active runs', async () => {
      state.status.mockResolvedValue({ entry: OWN_CORE, activeRuns: 2 });
      expect(await stop()).toEqual({ ready: false, activeRuns: 2 });
      expect(state.stop).not.toHaveBeenCalled();
    });

    it('stops it anyway when the user chose to interrupt', async () => {
      state.status.mockResolvedValue({ entry: OWN_CORE, activeRuns: 2 });
      const { stopCoreForUpdate } = await import('../electron/main/utils/CoreLauncher');
      expect(await stopCoreForUpdate(true)).toEqual({ ready: true });
      expect(state.stop).toHaveBeenCalledOnce();
    });

    it('is not ready when Core cannot count its runs', async () => {
      state.status.mockResolvedValue({ entry: OWN_CORE });
      expect(await stop()).toEqual({ ready: false, activeRuns: undefined });
      expect(state.stop).not.toHaveBeenCalled();
    });

    it('is not ready when a running Core does not answer', async () => {
      state.status.mockRejectedValue(new Error('timeout'));
      expect(await stop()).toEqual({ ready: false });
    });
  });

  describe('launchIfNeeded with a refused database', () => {
    async function launch() {
      const { launchIfNeeded } = await import('../electron/main/utils/CoreLauncher');
      return launchIfNeeded();
    }

    it('notices the refusal of a Core it started, without waiting out the timeout', async () => {
      state.pid = null;
      state.socket = false;
      state.spawned.mockImplementation(() => fs.writeFileSync(state.marker, 'refused'));
      expect(await launch()).toMatchObject({ wasRunning: false, databaseNewer: true });
    });

    it('notices the refusal of a Core that was already starting', async () => {
      state.socket = false;
      setTimeout(() => {
        fs.writeFileSync(state.marker, 'refused');
        state.pid = null;
      }, 10);
      expect(await launch()).toMatchObject({ wasRunning: true, databaseNewer: true });
    });

    it('ignores a marker from an earlier attempt', async () => {
      state.pid = null;
      state.socket = false;
      fs.writeFileSync(state.marker, 'old');
      state.spawned.mockImplementation(() => {
        state.pid = 43;
        state.socket = true;
      });
      expect(await launch()).toMatchObject({ wasRunning: false, databaseNewer: false });
      expect(fs.existsSync(state.marker)).toBe(false);
    });
  });
});

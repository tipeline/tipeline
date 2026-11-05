import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const { spawn, spawnSync, installCoreService, startCoreService, uninstallCoreService, serviceState, connect, logText } = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  installCoreService: vi.fn(),
  startCoreService: vi.fn(),
  uninstallCoreService: vi.fn(),
  serviceState: { installed: false, desktop: false },
  connect: vi.fn(),
  logText: { value: '' },
}));

vi.mock('node:child_process', () => ({ spawn, spawnSync }));
vi.mock('node:net', () => ({ default: { connect } }));
vi.mock('fs-extra', () => ({
  default: {
    existsSync: () => true,
    statSync: () => ({ size: 0 }),
    readFileSync: () => Buffer.from(logText.value),
  },
}));
vi.mock('@tipeline/utils/coreProcess', () => ({
  corePidFile: () => '/tmp/tipeline.pid',
  runningCorePid: () => 1234,
}));
vi.mock('@tipeline/utils/coreService', () => ({
  coreServiceSupport: () => ({ available: true, restartsOnCrash: true }),
  installCoreService,
  coreServiceIsDesktop: () => serviceState.desktop,
  isCoreServiceInstalled: () => serviceState.installed,
  startCoreService,
  uninstallCoreService,
}));

import Core from '../src/Core';
import * as coreProcess from '@tipeline/utils/coreProcess';

const require = createRequire(import.meta.url);
const coreRoot = path.dirname(require.resolve('@tipeline/core/package.json'));
const serverPath = path.join(coreRoot, 'dist/engine/Server.js');

/** A socket that fires `connect` or `error` as soon as a listener is added. */
function fakeSocket(event: 'connect' | 'error') {
  return {
    once(name: string, listener: () => void) {
      if (name === event) queueMicrotask(listener);
    },
    setTimeout: vi.fn(),
    destroy: vi.fn(),
  };
}

const isPrebuild = (call: unknown[]) => String((call[1] as string[])[0]).includes('prebuild-install');

describe('Core location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok\n', stderr: '' });
    spawn.mockReturnValue({ on: vi.fn(), once: vi.fn(), unref: vi.fn(), pid: 42 });
    connect.mockImplementation(() => fakeSocket('connect'));
    logText.value = '';
    serviceState.installed = false;
    serviceState.desktop = false;
  });

  it('runs the installer from the resolved core package with the current Node', () => {
    new Core().install({ force: true });

    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [path.join(coreRoot, 'dist/engine/Install.js'), '--force'],
      expect.anything()
    );
  });

  it('starts the server from the resolved core package with the current Node', async () => {
    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(null);

    await new Core().start();

    expect(spawn).toHaveBeenCalledWith(process.execPath, [serverPath], expect.anything());
  });

  it('points the auto-start service at the resolved core package', () => {
    new Core().serviceInstall();

    expect(installCoreService).toHaveBeenCalledWith({
      program: process.execPath,
      args: [serverPath],
    });
  });

  it('fetches the SQLite binary when it does not load, then carries on', () => {
    spawnSync
      .mockReturnValueOnce({ status: 1 })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    new Core().install();

    expect(spawnSync.mock.calls.filter(isPrebuild)).toHaveLength(1);
    expect(spawnSync.mock.calls.at(-1)?.[1]).toEqual([path.join(coreRoot, 'dist/engine/Install.js')]);
  });

  it('does not fetch the SQLite binary when it already loads', () => {
    new Core().install();

    expect(spawnSync.mock.calls.filter(isPrebuild)).toHaveLength(0);
  });

  it('explains how to recover when the SQLite binary cannot be fetched', () => {
    spawnSync.mockReturnValue({ status: 1 });

    expect(() => new Core().install()).toThrow('--allow-scripts=better-sqlite3');
    expect(spawnSync.mock.calls.at(-1)?.[1]?.[0]).not.toContain('Install.js');
  });

  it('reports the logged reason when Core exits during start', async () => {
    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(null);
    connect.mockImplementation(() => fakeSocket('error'));
    logText.value = '[2026-01-01T00:00:00.000Z] [ERROR] Failed to initialize: disk full\n';
    spawn.mockReturnValue({
      once: (_: string, listener: () => void) => listener(),
      on: vi.fn(),
      unref: vi.fn(),
      pid: 42,
    });

    await expect(new Core().start()).rejects.toThrow(/did not start[\s\S]*disk full/);
  });

  it("starts through the CLI's own auto-start service", async () => {
    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(null);
    serviceState.installed = true;

    await new Core().start();

    expect(startCoreService).toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("starts the CLI's own Core when auto-start belongs to Desktop", async () => {
    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(null);
    serviceState.installed = true;
    serviceState.desktop = true;

    await new Core().start();

    expect(startCoreService).not.toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(process.execPath, [serverPath], expect.anything());
  });

  it("says when auto-start belongs to Desktop", () => {
    serviceState.installed = true;
    serviceState.desktop = true;

    expect(new Core().serviceStatus()).toContain('Tipeline Desktop');
  });

  it('says Core is still running only when it is, on turning auto-start off', () => {
    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(1234);
    expect(new Core().serviceUninstall()).toBe('Auto-start is off. Core is still running.');
    expect(uninstallCoreService).toHaveBeenLastCalledWith(true);

    vi.spyOn(coreProcess, 'runningCorePid').mockReturnValue(null);
    expect(new Core().serviceUninstall()).toBe('Auto-start is off.');
    expect(uninstallCoreService).toHaveBeenLastCalledWith(false);
  });
});

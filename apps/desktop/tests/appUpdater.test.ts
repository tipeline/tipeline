import { beforeEach, describe, expect, it, vi } from 'vitest';

const { autoUpdater, stopCoreForUpdate } = vi.hoisted(() => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdates: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: true,
  },
  stopCoreForUpdate: vi.fn(),
}));

vi.mock('electron', () => ({ app: { isPackaged: true } }));
vi.mock('electron-updater', () => ({ default: { autoUpdater } }));
vi.mock('../electron/main/utils/CoreLauncher', () => ({ stopCoreForUpdate }));

async function load() {
  vi.resetModules();
  return import('../electron/main/utils/AppUpdater');
}

function finishDownload(version: string) {
  const [, handler] = autoUpdater.on.mock.calls.find(([event]) => event === 'update-downloaded')!;
  handler({ version });
}

describe('AppUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('does nothing until it is switched on', async () => {
    const { startAppUpdater, pendingUpdateVersion } = await load();
    await startAppUpdater(() => null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(autoUpdater.on).not.toHaveBeenCalled();
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(pendingUpdateVersion()).toBeNull();
  });

  it('checks in the background and tells the window when a version is ready', async () => {
    const send = vi.fn();
    const { startAppUpdater, pendingUpdateVersion } = await load();
    await startAppUpdater(() => ({ webContents: { send } }) as any, true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    finishDownload('0.3.0');
    expect(send).toHaveBeenCalledWith('app-update:ready', '0.3.0');
    expect(pendingUpdateVersion()).toBe('0.3.0');
  });

  it('waits for active runs instead of installing over them', async () => {
    stopCoreForUpdate.mockResolvedValue({ ready: false, activeRuns: 2 });
    const { startAppUpdater, installAppUpdate } = await load();
    await startAppUpdater(() => null, true);
    finishDownload('0.3.0');
    expect(await installAppUpdate()).toEqual({ installing: false, activeRuns: 2 });
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('installs once Core is out of the way', async () => {
    stopCoreForUpdate.mockResolvedValue({ ready: true });
    const { startAppUpdater, installAppUpdate } = await load();
    await startAppUpdater(() => null, true);
    finishDownload('0.3.0');
    expect(await installAppUpdate()).toEqual({ installing: true });
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });
});

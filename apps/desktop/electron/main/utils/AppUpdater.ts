import { app, type BrowserWindow } from 'electron';
import type { AppUpdater } from 'electron-updater';
import { stopCoreForUpdate } from './CoreLauncher';

// Off until releases are signed and notarized: macOS refuses to apply an update to an unsigned
// app. Turning this on is the only change needed, see RELEASING.md.
const AUTO_UPDATE_ENABLED = false;

const FIRST_CHECK_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let updater: AppUpdater | null = null;
let readyVersion: string | null = null;

/** Checks GitHub releases and downloads in the background; installing waits for the user. */
export async function startAppUpdater(
  getWindow: () => BrowserWindow | null,
  enabled = AUTO_UPDATE_ENABLED && app.isPackaged
): Promise<void> {
  if (!enabled) return;

  // Loaded only when on, and through default because it's a CommonJS module.
  const { autoUpdater } = (await import('electron-updater')).default;
  updater = autoUpdater;
  autoUpdater.autoDownload = true;
  // Installing replaces the files a running Core uses, so quitting alone must not do it.
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', ({ version }) => {
    readyVersion = version;
    getWindow()?.webContents.send('app-update:ready', version);
  });
  // No network or a broken release shouldn't bother anyone: the next check tries again.
  autoUpdater.on('error', (err) => console.warn('[AppUpdater]', err?.message ?? err));

  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => console.warn('[AppUpdater]', err?.message ?? err));
  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_INTERVAL_MS);
}

/** The version waiting to be installed, for a window that opened after it finished downloading. */
export function pendingUpdateVersion(): string | null {
  return readyVersion;
}

export async function installAppUpdate(interrupt = false): Promise<{ installing: boolean; activeRuns?: number }> {
  if (!updater || !readyVersion) return { installing: false };
  const { ready, activeRuns } = await stopCoreForUpdate(interrupt);
  if (!ready) return { installing: false, activeRuns };
  updater.quitAndInstall();
  return { installing: true };
}

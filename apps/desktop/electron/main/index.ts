import { app, BrowserWindow, shell, ipcMain, dialog, protocol, net, session } from 'electron';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { MessageManager } from './MessageManager';
import { AgentService } from './AgentService';
import { installAppUpdate, pendingUpdateVersion, startAppUpdater } from './utils/AppUpdater';
import { checkCoreVersion, getAutoStart, launchIfNeeded, restartCore, setAutoStart } from './utils/CoreLauncher';
import { SEND } from './utils/ipc-channels';
import { initDetachedWindows, openDetachedWindow } from './DetachedWindows';
import { checkOpenFile, checkOpenUrl, readableAppFile, resolveAppPath, type OpenFileMode } from './utils/appOpen';
import { isAppTrusted, recordPickedFile, setAppTrusted, wasPicked } from './appFileTrust';
import { mediaResponse, playableMediaFile } from './utils/appMedia';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Serves images stored on disk under `~/Tipeline` (App/Task uploads, Plugin
// icons) to the renderer as `tipeline-asset://<path relative to ~/Tipeline>`.
// A protocol handler (rather than base64-over-IPC) so a card grid can rely on
// the browser's normal <img> caching instead of re-reading/re-encoding the
// same file from disk on every render. Must be registered as privileged
// before app.whenReady() resolves.
const TIPELINE_ASSET_SCHEME = 'tipeline-asset';
const TIPELINE_DIR = path.join(os.homedir(), 'Tipeline');
// An app's video and audio files (see utils/appMedia): streamed, so players can seek.
const TIPELINE_MEDIA_SCHEME = 'tipeline-media';
protocol.registerSchemesAsPrivileged([
  { scheme: TIPELINE_ASSET_SCHEME, privileges: { secure: true, supportFetchAPI: true } },
  { scheme: TIPELINE_MEDIA_SCHEME, privileges: { secure: true, stream: true } },
]);

// Same rule as app:read-file: inside ~/Tipeline, or anywhere for an app the user
// trusts or a file they picked. The app's identifier comes from the Media component,
// which builds the link itself (an app's own `src` can't name another app).
const mediaAnywhere = (appIdentifier: string, real: string) => isAppTrusted(appIdentifier) || wasPicked(real);

function registerMediaProtocol() {
  protocol.handle(TIPELINE_MEDIA_SCHEME, (request) => {
    const response = mediaResponse(request.url, request.headers.get('range'), os.homedir(), mediaAnywhere);
    // A refused request says why in the terminal: the player only sees "failed".
    if (response.status >= 400) {
      const query = new URL(request.url).searchParams;
      console.warn(`[tipeline-media] ${response.status} for ${query.get('path')} (app ${query.get('app')})`);
    }
    return response;
  });
}

// Whether a media file can be played — asked first, so the component can say why not.
ipcMain.handle('app:media-check', (_event, { path: raw, appIdentifier } = {}) => {
  const found = playableMediaFile(raw, os.homedir(), (real) => mediaAnywhere(appIdentifier, real));
  return found.ok ? { ok: true } : found;
});

function registerAssetProtocol() {
  protocol.handle(TIPELINE_ASSET_SCHEME, (request) => {
    // `?…` is a cache-buster (an app Image reloads a file a workflow rewrote), not
    // part of the path. A path may also be absolute or start with `~/` — it still has
    // to be inside ~/Tipeline.
    const raw = decodeURIComponent(request.url.replace(`${TIPELINE_ASSET_SCHEME}://`, '').split('?')[0]);
    const relativePath = raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
    const resolved = path.resolve(TIPELINE_DIR, relativePath);
    if (!resolved.startsWith(TIPELINE_DIR + path.sep) || !fs.existsSync(resolved)) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Register before createWindow so it's ready as soon as the renderer loads.
// Probes the Core IPC socket; spawns Core as a detached daemon if not running.
// Core outlives this window — closing the desktop does not stop Core.
ipcMain.handle(SEND.CORE_LAUNCH, () => launchIfNeeded());
ipcMain.handle(SEND.CORE_VERSION_CHECK, () => checkCoreVersion());
ipcMain.handle(SEND.CORE_RESTART, () => restartCore());
ipcMain.handle(SEND.AUTO_START_GET, () => getAutoStart());
ipcMain.handle(SEND.AUTO_START_SET, (_, enabled: boolean) => setAutoStart(enabled));
ipcMain.handle(SEND.APP_VERSION, () => app.getVersion());
ipcMain.handle(SEND.APP_UPDATE_STATE, () => pendingUpdateVersion());
ipcMain.handle(SEND.APP_UPDATE_INSTALL, (_, interrupt?: boolean) => installAppUpdate(interrupt === true));

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, '../preload/index.mjs');
const indexHtml = path.join(RENDERER_DIST, 'index.html');

async function createWindow() {
  win = new BrowserWindow({
    title: 'Tipeline',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: 1200,
    height: 700,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  });

  const messageManager = new MessageManager(win as BrowserWindow);
  messageManager.init().catch((err) => console.error('[MessageManager] init error:', err));

  new AgentService(win as BrowserWindow).init();

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL);
    // // Open devTool if the app is not packaged
    // win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml);
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {});

  // Make all links open with the browser (or mail client), not with the application.
  // Only web and mail links — the same ones app Markdown renders as links.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

// Web permissions (camera, microphone, location, notifications…) only for Tipeline's
// own pages: a page embedded in an app (an Embed component) is denied them all —
// Electron would otherwise grant them without asking.
function fencePermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback, details) =>
    callback(details.isMainFrame)
  );
  session.defaultSession.setPermissionCheckHandler((_contents, _permission, _origin, details) => details.isMainFrame);
}

app.whenReady().then(() => {
  fencePermissions();
  registerAssetProtocol();
  registerMediaProtocol();
  createWindow();
  startAppUpdater(() => win).catch((err) => console.warn('[AppUpdater]', err?.message ?? err));
});

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

ipcMain.handle('dialog:open-file', async (event, { filters } = {}) => {
  const focusedWindow =
    BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(focusedWindow as BrowserWindow, {
    properties: ['openFile'],
    filters: filters ?? [{ name: 'YAML Files', extensions: ['yml', 'yaml'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle(
  'dialog:save-file',
  async (event, { defaultPath, content, filters } = {}) => {
    const focusedWindow =
      BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showSaveDialog(focusedWindow as BrowserWindow, {
      defaultPath,
      filters: filters ?? [{ name: 'YAML Files', extensions: ['yml', 'yaml'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    if (content !== undefined) {
      await fs.promises.writeFile(result.filePath, content, 'utf-8');
    }
    return { success: true, filePath: result.filePath };
  }
);

ipcMain.handle('shell:show-item-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

// The bytes behind a web link, for an app's PDF viewer: the page itself can't read
// most other sites (CORS). Web links only, at most 50 MB, 30 s.
const FETCH_MAX_BYTES = 50 * 1024 * 1024;
ipcMain.handle('app:fetch-url', async (_event, { url } = {}) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) return { ok: false, error: 'badUrl' };
  try {
    const response = await net.fetch(url.trim(), { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return { ok: false, error: 'httpError', detail: String(response.status) };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > FETCH_MAX_BYTES) return { ok: false, error: 'tooLarge' };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > FETCH_MAX_BYTES) return { ok: false, error: 'tooLarge' };
    return { ok: true, bytes };
  } catch (e: any) {
    return { ok: false, error: 'fetchFailed', detail: e?.message ?? String(e) };
  }
});

// The bytes of a file a workflow wrote, for an app's PDF viewer. Same rule as the
// tipeline-asset:// protocol (only inside ~/Tipeline; links followed, so one can't
// point outside), but answered over IPC: the renderer may not fetch() that protocol
// across origins, only show it in <img>. At most 50 MB.
ipcMain.handle('app:read-file', async (_event, { path: raw, appIdentifier } = {}) => {
  // Outside ~/Tipeline only for an app the user trusts, or a file they picked.
  const trusted = isAppTrusted(appIdentifier);
  const target = readableAppFile(raw, os.homedir(), FETCH_MAX_BYTES, (real) => trusted || wasPicked(real));
  if (!target.ok) return target;
  return { ok: true, bytes: new Uint8Array(await fs.promises.readFile(target.file)) };
});

// File access per app (see appFileTrust.ts): only Tipeline's own screens call these —
// creating an app trusts it, and the app's Edit dialog switches it.
ipcMain.handle('app:file-trust:get', (_event, { appIdentifier } = {}) => isAppTrusted(appIdentifier));
ipcMain.handle('app:file-trust:set', (_event, { appIdentifier, trusted } = {}) => {
  setAppTrusted(appIdentifier, trusted === true);
  return isAppTrusted(appIdentifier);
});
// This computer's platform (in workflow terms) and account name, for the defaults a new
// workflow or app starts with (Settings → Defaults).
ipcMain.handle('app:system-info', () => {
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
  let username = '';
  try {
    username = os.userInfo().username;
  } catch {
    // No passwd entry (some containers): leave it empty.
  }
  return { platform, username };
});
// Sent by the preload itself when it hands a dropped / picked file's path to a page.
ipcMain.on('app:file-picked', (_event, file: unknown) => recordPickedFile(file));

// An app's openUrl / openFile actions (see utils/appOpen.ts for what's allowed).
// Each answers { ok: true } or { ok: false, error } — the error is a code the app
// shows as a message; "save" also answers { ok: true, canceled } when dismissed.
ipcMain.handle('app:open-url', async (_event, { url } = {}) => {
  const refusal = checkOpenUrl(url);
  if (refusal) return { ok: false, error: refusal };
  await shell.openExternal(String(url).trim());
  return { ok: true };
});

ipcMain.handle('app:open-file', async (event, { path: raw, mode, appIdentifier } = {}) => {
  const how: OpenFileMode = mode === 'reveal' || mode === 'save' ? mode : 'open';
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'notFound' };
  const home = os.homedir();
  let file = resolveAppPath(raw, home);
  try {
    file = fs.realpathSync(file); // links followed: a link can't smuggle a program in
  } catch {
    return { ok: false, error: 'notFound' };
  }
  const refusal = checkOpenFile(
    file,
    how,
    home,
    (p) => {
      try {
        const st = fs.statSync(p);
        return { isFile: st.isFile(), isDirectory: st.isDirectory(), executable: st.isFile() && (st.mode & 0o111) !== 0 };
      } catch {
        return null;
      }
    },
    isAppTrusted(appIdentifier) || wasPicked(file) // programs stay refused either way
  );
  if (refusal) return { ok: false, error: refusal };
  if (how === 'reveal') {
    shell.showItemInFolder(file);
    return { ok: true };
  }
  if (how === 'save') {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showSaveDialog(win as BrowserWindow, {
      defaultPath: path.join(app.getPath('downloads'), path.basename(file)),
    });
    if (result.canceled || !result.filePath) return { ok: true, canceled: true };
    await fs.promises.copyFile(file, result.filePath);
    return { ok: true, savedTo: result.filePath };
  }
  const failure = await shell.openPath(file); // "" when it worked
  return failure ? { ok: false, error: 'openFailed', detail: failure } : { ok: true };
});

// Pages opened in their own window (an app, a run, a read-only workflow) — see
// DetachedWindows.ts for which pages may.
initDetachedWindows({
  preload,
  indexHtml,
  devServerUrl: VITE_DEV_SERVER_URL,
  icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
});
ipcMain.handle(SEND.OPEN_WINDOW, (_event, args: { path?: unknown; title?: unknown } = {}) =>
  openDetachedWindow(args.path, args.title)
);

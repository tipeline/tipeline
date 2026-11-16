import { app, BrowserWindow, ipcMain, Menu, nativeTheme, Notification, screen, Tray, type MenuItemConstructorOptions, type Rectangle } from 'electron';
import path from 'node:path';
import { SEND } from './utils/ipc-channels';
import { trayImage } from './trayIcon';
import { readTraySettings, writeTraySettings, type TraySettings } from './traySettings';

// Tipeline in the menu bar (macOS) / notification area (Windows) / status area (Linux).
//
// A small frameless window — the popover — shows what needs the user and what's running.
// It loads the same renderer with `?tray=1`, which mounts the compact TrayApp instead of
// the full app. It's created hidden at start and stays loaded, so it can keep the icon's
// badge and the Linux menu up to date even while nobody opens it.
//
// Linux trays (AppIndicator) often don't report clicks or where the icon is, so there the
// icon opens a native menu built from the same state instead of the popover.

export const POPOVER_WIDTH = 360;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 640;
const GAP = 6;
const USES_MENU = process.platform === 'linux';

export interface TrayMenuItem {
  label: string;
  path: string;
}

/** What the popover's page reports: the badge count, and the Linux menu's entries. */
export interface TrayState {
  count: number;
  needs: TrayMenuItem[];
  needsMore: number;
  running: TrayMenuItem[];
  runningMore: number;
  labels: Record<
    'open' | 'quit' | 'needsTitle' | 'runningTitle' | 'allClear' | 'seeAll' | 'moreRunning' | 'tooltip' | 'hintTitle' | 'hintBody',
    string
  >;
}

const ENGLISH: TrayState['labels'] = {
  open: 'Open Tipeline',
  quit: 'Quit Tipeline',
  needsTitle: 'Needs you',
  runningTitle: 'Running',
  allClear: 'All clear',
  seeAll: 'See all',
  moreRunning: 'More running…',
  tooltip: 'Tipeline',
  hintTitle: 'Tipeline is still running',
  hintBody: 'It keeps running in the menu bar. You can change this in Settings → About.',
};

/** A path inside the app (`/approvals`, `/tasks/x/pipelines/y`), never a URL. */
export function isAppPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 300 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\s]/.test(value)
  );
}

const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value.slice(0, 120) : fallback);

function cleanItems(value: unknown): TrayMenuItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 10)
    .filter((item) => item && isAppPath(item.path))
    .map((item) => ({ label: text(item.label), path: item.path }));
}

/** The page's report, checked: it comes from a renderer, so nothing is trusted as is. */
export function cleanTrayState(raw: any): TrayState {
  const count = Number.isFinite(raw?.count) ? Math.max(0, Math.min(999, Math.floor(raw.count))) : 0;
  const labels = { ...ENGLISH };
  for (const key of Object.keys(ENGLISH) as Array<keyof TrayState['labels']>) {
    labels[key] = text(raw?.labels?.[key], ENGLISH[key]) || ENGLISH[key];
  }
  const more = (n: unknown) => (Number.isFinite(n) ? Math.max(0, Math.floor(n as number)) : 0);
  return {
    count,
    needs: cleanItems(raw?.needs),
    needsMore: more(raw?.needsMore),
    running: cleanItems(raw?.running),
    runningMore: more(raw?.runningMore),
    labels,
  };
}

/**
 * Where the popover goes: centred under (or over) the icon, kept inside the screen's work
 * area. Below the icon when it's in the top half of the screen (macOS menu bar, a Windows
 * taskbar moved to the top), above it otherwise. A tray that doesn't say where its icon is
 * (empty bounds) gets the top right corner.
 */
export function popoverPosition(
  icon: Rectangle,
  size: { width: number; height: number },
  workArea: Rectangle
): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const maxX = workArea.x + workArea.width - size.width - GAP;
  const maxY = workArea.y + workArea.height - size.height - GAP;
  if (!icon.width && !icon.height) {
    return { x: maxX, y: workArea.y + GAP };
  }
  const x = clamp(Math.round(icon.x + icon.width / 2 - size.width / 2), workArea.x + GAP, maxX);
  const below = icon.y + icon.height / 2 < workArea.y + workArea.height / 2;
  const y = below ? icon.y + icon.height + GAP : icon.y - size.height - GAP;
  return { x, y: clamp(y, workArea.y + GAP, maxY) };
}

interface Options {
  preload: string;
  indexHtml: string;
  devServerUrl?: string;
  /** Shows the main window, on `path` when given. */
  showMain: (path?: string) => void;
  /** Shows the main window with its Assistant panel open. */
  openAssistant: () => void;
}

let tray: Tray | null = null;
let popover: BrowserWindow | null = null;
let state: TrayState = cleanTrayState({});
let settings: TraySettings = { keepRunning: true, hintShown: false };
let hiddenAt = 0;
let options: Options | null = null;

const settingsDir = () => app.getPath('userData');

export function keepRunning(): boolean {
  return settings.keepRunning;
}

function iconImage() {
  if (process.platform === 'darwin') return trayImage({ color: [0, 0, 0], template: true });
  // Windows and Linux draw it as is: light on a dark bar, dark on a light one.
  const color: [number, number, number] = nativeTheme.shouldUseDarkColors || process.platform === 'linux' ? [240, 240, 240] : [19, 23, 28];
  return trayImage({ color, dot: state.count > 0 });
}

function refreshIcon() {
  if (!tray) return;
  tray.setImage(iconImage());
  // macOS puts the number next to the icon; elsewhere the dot says it.
  if (process.platform === 'darwin') tray.setTitle(state.count ? String(state.count) : '', { fontType: 'monospacedDigit' });
  tray.setToolTip(state.count ? `${state.labels.tooltip} · ${state.count}` : state.labels.tooltip);
  if (USES_MENU) tray.setContextMenu(buildMenu());
}

function buildMenu(): Menu {
  const open = (p: string) => () => options?.showMain(p);
  const items: MenuItemConstructorOptions[] = [];
  if (state.needs.length) {
    items.push({ label: `${state.labels.needsTitle} (${state.count})`, enabled: false });
    for (const item of state.needs) items.push({ label: item.label, click: open(item.path) });
    if (state.needsMore) items.push({ label: `${state.labels.seeAll} (${state.needs.length + state.needsMore})`, click: open('/') });
  } else {
    items.push({ label: state.labels.allClear, enabled: false });
  }
  if (state.running.length) {
    items.push({ type: 'separator' }, { label: state.labels.runningTitle, enabled: false });
    for (const item of state.running) items.push({ label: item.label, click: open(item.path) });
    if (state.runningMore) items.push({ label: state.labels.moreRunning, click: open('/activity?status=running') });
  }
  items.push(
    { type: 'separator' },
    { label: state.labels.open, click: () => options?.showMain() },
    { label: state.labels.quit, click: () => app.quit() }
  );
  return Menu.buildFromTemplate(items);
}

/** The small menu a right-click shows on macOS and Windows. */
function shortMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: state.labels.open, click: () => options?.showMain() },
    { type: 'separator' },
    { label: state.labels.quit, click: () => app.quit() },
  ]);
}

function placePopover() {
  if (!tray || !popover) return;
  const icon = tray.getBounds();
  const [width, height] = popover.getSize();
  const point = icon.width ? { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 } : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const { x, y } = popoverPosition(icon, { width, height }, workArea);
  popover.setPosition(x, y, false);
}

function showPopover() {
  if (!popover) return;
  placePopover();
  popover.show();
  popover.focus();
  popover.webContents.send('tray:shown');
}

function hidePopover() {
  if (popover?.isVisible()) {
    popover.hide();
    hiddenAt = Date.now();
  }
}

function togglePopover() {
  if (!popover) return;
  if (popover.isVisible()) return hidePopover();
  // Clicking the icon while the popover is open first blurs (hides) it; that same click
  // must not open it again.
  if (Date.now() - hiddenAt < 300) return;
  showPopover();
}

function createPopover(opts: Options) {
  popover = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: 420,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#ffffff',
    webPreferences: { preload: opts.preload },
  });
  if (process.platform === 'darwin') popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  popover.on('blur', hidePopover);
  popover.on('closed', () => (popover = null));
  // Links in the popover open in the browser, never in it.
  popover.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (opts.devServerUrl) popover.loadURL(`${opts.devServerUrl}?tray=1`);
  else popover.loadFile(path.resolve(opts.indexHtml), { query: { tray: '1' } });
}

const fromPopover = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
  !!popover && event.sender === popover.webContents;

function registerIpc() {
  ipcMain.on(SEND.TRAY_STATE, (event, raw) => {
    if (!fromPopover(event)) return;
    state = cleanTrayState(raw);
    refreshIcon();
  });
  ipcMain.on(SEND.TRAY_RESIZE, (event, raw) => {
    if (!fromPopover(event) || !popover || !Number.isFinite(raw)) return;
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const height = Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, workArea.height - 4 * GAP, raw)));
    if (popover.getSize()[1] === height) return;
    popover.setSize(POPOVER_WIDTH, height, false);
    if (popover.isVisible()) placePopover();
  });
  ipcMain.handle(SEND.TRAY_OPEN, (event, target?: unknown) => {
    if (!fromPopover(event)) return;
    hidePopover();
    options?.showMain(isAppPath(target) ? target : undefined);
  });
  ipcMain.handle(SEND.TRAY_ASSISTANT, (event) => {
    if (!fromPopover(event)) return;
    hidePopover();
    options?.openAssistant();
  });
  ipcMain.handle(SEND.TRAY_HIDE, (event) => {
    if (fromPopover(event)) hidePopover();
  });
  ipcMain.handle(SEND.TRAY_SETTINGS_GET, () => ({ keepRunning: settings.keepRunning }));
  ipcMain.handle(SEND.TRAY_SETTINGS_SET, (_event, value: { keepRunning?: unknown } = {}) => {
    if (typeof value.keepRunning === 'boolean') {
      settings = { ...settings, keepRunning: value.keepRunning };
      writeTraySettings(settingsDir(), settings);
    }
    return { keepRunning: settings.keepRunning };
  });
}

export function initTray(opts: Options) {
  options = opts;
  settings = readTraySettings(settingsDir());
  registerIpc();
  tray = new Tray(iconImage());
  tray.setToolTip(state.labels.tooltip);
  if (USES_MENU) {
    tray.setContextMenu(buildMenu());
  } else {
    tray.on('click', togglePopover);
    tray.on('right-click', () => tray?.popUpContextMenu(shortMenu()));
  }
  nativeTheme.on('updated', refreshIcon);
  createPopover(opts);
}

/**
 * Called when closing the window only hid it: the first time, a notification says where
 * Tipeline went, so it doesn't look like it quit (or like it's stuck open).
 */
export function noteWindowHidden() {
  if (settings.hintShown) return;
  settings = { ...settings, hintShown: true };
  writeTraySettings(settingsDir(), settings);
  if (Notification.isSupported()) {
    new Notification({ title: state.labels.hintTitle, body: state.labels.hintBody, silent: true }).show();
  }
}

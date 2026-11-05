import { BrowserWindow } from 'electron';
import path from 'node:path';

// Extra windows that show one page on its own (no sidebar): an app in run-only mode or
// a run's live detail. Only these pages can open in a window — editors and settings stay in the main window, where a single copy of each
// can't overwrite another. Keep in sync with src/utils/detachedWindows.ts.
const ID = '[A-Za-z0-9_-]{1,64}';
const ALLOWED_PATHS = [
  new RegExp(`^/window/apps/${ID}$`),
  new RegExp(`^/window/runs/${ID}/${ID}$`),
];

export function isDetachedPath(value: unknown): value is string {
  return (
    typeof value === 'string' && ALLOWED_PATHS.some((re) => re.test(value))
  );
}

interface Options {
  preload: string;
  indexHtml: string;
  devServerUrl?: string;
  icon: string;
}

let options: Options | null = null;
// One window per page: opening the same page again focuses it.
const windows = new Map<string, BrowserWindow>();

export function initDetachedWindows(opts: Options) {
  options = opts;
}

export function openDetachedWindow(pagePath: unknown, title: unknown): void {
  if (!options) throw new Error('Windows are not ready yet');
  if (!isDetachedPath(pagePath))
    throw new Error('This page cannot open in its own window');

  const existing = windows.get(pagePath);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }

  // Same secure webPreferences as the main window (preload + context isolation). The
  // page reaches the renderer only as a validated query parameter.
  const win = new BrowserWindow({
    title:
      typeof title === 'string' && title ? title.slice(0, 200) : 'Tipeline',
    icon: options.icon,
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    webPreferences: { preload: options.preload },
  });
  windows.set(pagePath, win);
  win.on('closed', () => windows.delete(pagePath));

  if (options.devServerUrl) {
    win.loadURL(
      `${options.devServerUrl}?window=${encodeURIComponent(pagePath)}`
    );
  } else {
    win.loadFile(path.resolve(options.indexHtml), {
      query: { window: pagePath },
    });
  }
}

/**
 * Closes every extra window and returns how many were open. Called when the workspace
 * changes: they show items of the previous workspace, and all windows share one
 * connection, so leaving them open would point them at a workspace they weren't
 * opened in.
 */
export function closeDetachedWindows(): number {
  let closed = 0;
  for (const win of windows.values()) {
    if (!win.isDestroyed()) {
      win.close();
      closed++;
    }
  }
  windows.clear();
  return closed;
}

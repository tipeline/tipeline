import { SEND } from '@/ipc-channels';

// Pages that can open in their own window — an app (run-only) or a run's live detail. Editors and settings stay in the main window so there's
// only ever one copy of each to save. Keep in sync with electron/main/DetachedWindows.ts,
// which refuses any other page.
const ID = '[A-Za-z0-9_-]{1,64}';
const ALLOWED_PATHS = [
  new RegExp(`^/window/apps/${ID}$`),
  new RegExp(`^/window/runs/${ID}/${ID}$`),
];

export const windowPaths = {
  app: (appIdentifier: string) => `/window/apps/${appIdentifier}`,
  run: (taskIdentifier: string, pipelineIdentifier: string) =>
    `/window/runs/${taskIdentifier}/${pipelineIdentifier}`,
};

export function isDetachedPath(value: unknown): value is string {
  return (
    typeof value === 'string' && ALLOWED_PATHS.some((re) => re.test(value))
  );
}

/** Opens a page in its own window, or focuses it if it's already open. */
export function openInWindow(path: string, title?: string): void {
  void window.ipcRenderer.invoke(SEND.OPEN_WINDOW, { path, title });
}

/** The page the window was opened on (`?window=`), when this is a detached window. */
export function detachedWindowPath(): string | null {
  const value = new URLSearchParams(window.location.search).get('window');
  return isDetachedPath(value) ? value : null;
}

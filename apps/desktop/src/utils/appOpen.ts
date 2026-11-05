// The renderer side of an app's openUrl / openFile actions: asks the main process
// (which decides what's allowed — electron/main/utils/appOpen.ts) and says why not.

export type OpenResult = { ok: true; canceled?: boolean; savedTo?: string } | { ok: false; error: string };

export async function openAppUrl(url: string): Promise<OpenResult> {
  if (!window.ipcRenderer) {
    // Outside the desktop app (tests, a browser): a plain new tab, web links only.
    if (!/^(https?:\/\/|mailto:)\S+$/i.test(url.trim())) return { ok: false, error: 'badUrl' };
    window.open(url.trim(), '_blank', 'noopener');
    return { ok: true };
  }
  return window.ipcRenderer.invoke('app:open-url', { url });
}

/**
 * `remote`: the app talks to a core on another machine — its files are there, not
 * here, so nothing can be opened.
 */
export async function openAppFile(
  path: string,
  mode: 'open' | 'reveal' | 'save',
  remote: boolean,
  /** The app asking: a trusted app may open files outside ~/Tipeline (never programs). */
  appIdentifier?: string
): Promise<OpenResult> {
  if (remote) return { ok: false, error: 'remote' };
  if (!window.ipcRenderer) return { ok: false, error: 'desktopOnly' };
  return window.ipcRenderer.invoke('app:open-file', { path, mode, appIdentifier });
}

/** Whether this computer lets the app use files anywhere (see electron appFileTrust). */
export async function getAppFileTrust(appIdentifier: string): Promise<boolean> {
  return window.ipcRenderer ? !!(await window.ipcRenderer.invoke('app:file-trust:get', { appIdentifier })) : false;
}

/** Only Tipeline's own screens call this — never an app's actions. */
export async function setAppFileTrust(appIdentifier: string, trusted: boolean): Promise<boolean> {
  return window.ipcRenderer ? !!(await window.ipcRenderer.invoke('app:file-trust:set', { appIdentifier, trusted })) : false;
}

/**
 * Where the sign-in is kept between launches.
 *
 * For now this is the WebView's localStorage, which is fine in a browser while developing.
 * Before the app ships, the native build must keep the token in the Keychain (iOS) and the
 * Keystore (Android) through a secure-storage plugin; only this file changes.
 */

const KEY = 'tipeline.session';

export interface SavedSession {
  serverUrl: string;
  token: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.serverUrl === 'string' && typeof parsed?.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode or full storage: the person signs in again next launch.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

const SERVER_KEY = 'tipeline.lastServer';

/** The last server address, kept after signing out so it's filled in next time. */
export function lastServer(): string {
  try {
    return localStorage.getItem(SERVER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberServer(serverUrl: string): void {
  try {
    localStorage.setItem(SERVER_KEY, serverUrl);
  } catch {
    // Not important.
  }
}

/** A small per-server list kept on this phone (stars, dismissed Inbox items). */
function serverListKey(name: string, serverUrl: string): string {
  return `tipeline.${name}:${serverUrl}`;
}

export function loadServerList(name: string, serverUrl: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(serverListKey(name, serverUrl)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function saveServerList(name: string, serverUrl: string, values: string[]): void {
  try {
    localStorage.setItem(serverListKey(name, serverUrl), JSON.stringify(values));
  } catch {
    // Not important: it is only this phone's preference.
  }
}

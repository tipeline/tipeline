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

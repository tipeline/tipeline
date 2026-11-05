// Small per-workspace lists kept in localStorage (recent items, starred items, dismissed
// inbox entries). Each connection gets its own key, so switching workspace switches lists.

function storageKey(name: string, connectionId: string): string {
  return `tipeline:${name}:${connectionId}`;
}

export function loadForConnection<T>(name: string, connectionId: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey(name, connectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveForConnection<T>(name: string, connectionId: string, items: T[]): void {
  try {
    localStorage.setItem(storageKey(name, connectionId), JSON.stringify(items));
  } catch {
    // Storage unavailable/quota exceeded — degrade to in-memory only.
  }
}

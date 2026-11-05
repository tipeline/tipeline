import os from 'node:os';
import path from 'node:path';

/**
 * Groups whose steps read or write files on this machine. In these, a value
 * starting with "~/" (or exactly "~") means the user's home folder, as it does
 * in a terminal — Node doesn't expand it, so "~/Documents/x.txt" would otherwise
 * create a folder literally named "~" wherever Core happens to run.
 *
 * Not ssh: there "~" is the remote machine's home, and the remote shell expands it.
 */
export const LOCAL_FILE_GROUPS = new Set([
  'audio',
  'browser',
  'compression',
  'cryptography',
  'database',
  'email',
  'file',
  'folder',
  'http',
  'image',
  'ocr',
  'pdf',
  'qrcode',
  'spreadsheet',
  'system',
  'video',
]);

/** Steps in those groups whose values are text to show, not paths. */
const TEXT_ACTIONS = new Set(['system.message']);

/** Whether a built-in step's "~" paths are expanded before it runs. */
export function expandsHomePaths(group: string, name: string, source?: string): boolean {
  return source !== 'plugin' && LOCAL_FILE_GROUPS.has(group) && !TEXT_ACTIONS.has(`${group}.${name}`);
}

/** "~" or "~/…" (also "~\\…" on Windows) to an absolute path under the home folder; anything else unchanged. */
export function expandHomePath(value: string, home = os.homedir()): string {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(home, value.slice(2));
  return value;
}

/**
 * The same params with every "~" path expanded, looking inside plain objects and
 * arrays (a database connection's filename, a list of attachments). Live values
 * such as browser sessions or database handles are left exactly as they are.
 */
export function expandHomeInParams<T>(value: T, home = os.homedir()): T {
  if (typeof value === 'string') return expandHomePath(value, home) as T;
  if (Array.isArray(value)) return value.map((item) => expandHomeInParams(item, home)) as T;
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = expandHomeInParams(item, home);
    return out as T;
  }
  return value;
}

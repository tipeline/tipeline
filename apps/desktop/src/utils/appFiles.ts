// The file dropzone's rules: which dropped / picked files it takes, and why it turns
// the others down. Dropping ignores the browser's `accept`, so it is checked here.

export interface DroppedFile {
  name: string;
  /** Where it is on disk — what workflows get. */
  path: string;
  /** Bytes. */
  size: number;
  /** MIME type, when the system knows it ("" otherwise). */
  type: string;
}

export type RejectReason = 'type' | 'size' | 'count' | 'duplicate' | 'noPath';

export interface FileRules {
  /** As an <input accept>: ".pdf, .png, image/*, application/json" (or an array of them). */
  accept?: unknown;
  /** Largest file, in MB. */
  maxSizeMb?: unknown;
  /** Most files kept at once (1 when not `multiple`). */
  maxFiles?: unknown;
  multiple?: boolean;
}

/** The accept tokens, lower-cased: ".pdf", "image/*", "application/json". */
export function acceptTokens(accept: unknown): string[] {
  const list = Array.isArray(accept) ? accept : String(accept ?? '').split(',');
  return list
    .map((token) => String(token).trim().toLowerCase())
    .filter(Boolean)
    .map((token) => (token.includes('/') || token.startsWith('.') ? token : `.${token}`));
}

export function accepts(file: Pick<DroppedFile, 'name' | 'type'>, accept: unknown): boolean {
  const tokens = acceptTokens(accept);
  if (!tokens.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return tokens.some((token) =>
    token.startsWith('.')
      ? name.endsWith(token)
      : token.endsWith('/*')
        ? type.startsWith(token.slice(0, -1))
        : type === token
  );
}

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Adds `incoming` to `current` by the rules. Without `multiple` the newest file
 * replaces the one kept. Files already kept (same path) are skipped.
 */
export function addFiles(
  current: DroppedFile[],
  incoming: DroppedFile[],
  rules: FileRules
): { files: DroppedFile[]; rejected: Array<{ name: string; reason: RejectReason }> } {
  const rejected: Array<{ name: string; reason: RejectReason }> = [];
  const maxBytes = positive(rules.maxSizeMb) ? positive(rules.maxSizeMb)! * 1024 * 1024 : null;
  const limit = rules.multiple === false ? 1 : (positive(rules.maxFiles) ?? Infinity);
  let files = rules.multiple === false ? [] : [...current];
  for (const file of incoming) {
    if (!file.path) rejected.push({ name: file.name, reason: 'noPath' });
    else if (!accepts(file, rules.accept)) rejected.push({ name: file.name, reason: 'type' });
    else if (maxBytes !== null && file.size > maxBytes) rejected.push({ name: file.name, reason: 'size' });
    else if (files.some((f) => f.path === file.path)) rejected.push({ name: file.name, reason: 'duplicate' });
    else if (rules.multiple === false) files = [file];
    else if (files.length >= limit) rejected.push({ name: file.name, reason: 'count' });
    else files.push(file);
  }
  // Without `multiple`, only the last good file stays; earlier good ones aren't "rejected".
  return { files: rules.multiple === false && !files.length ? current.slice(0, 1) : files, rejected };
}

/** "820 B", "12.4 KB", "3.1 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** The value a dropzone exposes: every path, or the one path (null) without `multiple`. */
export function filesValue(files: DroppedFile[], multiple: boolean | undefined): string[] | string | null {
  return multiple === false ? (files[0]?.path ?? null) : files.map((f) => f.path);
}

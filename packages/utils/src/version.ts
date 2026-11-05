function parseVersion(version: unknown): number[] | null {
  const match = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(version) : null;
  return match ? match.slice(1).map(Number) : null;
}

/** True only when both are real versions and `version` is behind `other`. Pre-release tags are ignored. */
export function isOlderVersion(version: unknown, other: unknown): boolean {
  const a = parseVersion(version);
  const b = parseVersion(other);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

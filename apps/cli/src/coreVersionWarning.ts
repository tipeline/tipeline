import { isOlderVersion } from '@tipeline/utils';

/** What to tell someone whose CLI and local Core differ. Null when they match or one is unknown. */
export function coreVersionWarning(cliVersion: unknown, coreVersion: unknown): string | null {
  if (isOlderVersion(cliVersion, coreVersion)) {
    return `This CLI (${cliVersion}) is older than the running Core (${coreVersion}), and some commands may not work. Update it with: npm i -g @tipeline/cli`;
  }
  if (isOlderVersion(coreVersion, cliVersion)) {
    return `The running Core (${coreVersion}) is older than this CLI (${cliVersion}), and some commands may not work. Restart it with: tipeline stop, then tipeline start`;
  }
  return null;
}

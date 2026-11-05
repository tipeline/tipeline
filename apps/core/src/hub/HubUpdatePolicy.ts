import semver from 'semver';

/**
 * How an installed item's version relates to what its hub lists:
 * - `current`: the same, or nothing comparable is listed.
 * - `available`: a newer minor or patch, which auto-update may install.
 * - `major`: a newer major version, which always waits for the user.
 * - `older`: the hub lists less than what's installed, which is never installed.
 */
export type HubUpdateState = 'current' | 'available' | 'major' | 'older';

export function hubUpdateState(installed: string | null | undefined, listed: string | null | undefined): HubUpdateState {
  if (!listed || !semver.valid(listed)) return 'current';
  // An installed copy without a usable version can't be compared, so anything listed is an update.
  if (!installed || !semver.valid(installed)) return 'available';
  if (semver.lt(listed, installed)) return 'older';
  if (semver.eq(listed, installed)) return 'current';
  return semver.major(listed) > semver.major(installed) ? 'major' : 'available';
}

/** Why a downloaded file wasn't installed. */
export class HubUpdateHeldError extends Error {
  constructor(
    public kind: 'downgrade' | 'major' | 'unchanged',
    public fileVersion: string,
    message: string
  ) {
    super(message);
    this.name = 'HubUpdateHeldError';
  }
}

/**
 * The catalog only claims a version; this checks the file that was actually downloaded,
 * since a hub can list one version and serve another. An older file is never installed, nor
 * is one with the version already installed: the listing promised something newer, so the
 * publisher forgot to bump the file. A major one is only installed when the user asked for
 * it (`automatic` false).
 */
export function checkHubFileVersion(
  name: string,
  installed: string | null | undefined,
  fileVersion: string | null | undefined,
  automatic: boolean
) {
  if (!fileVersion || !semver.valid(fileVersion)) return;
  const state = hubUpdateState(installed, fileVersion);
  if (state === 'older') {
    throw new HubUpdateHeldError(
      'downgrade',
      fileVersion,
      `The hub's file for "${name}" is version ${fileVersion}, older than the installed ${installed}, so it wasn't installed`
    );
  }
  if (state === 'current') {
    throw new HubUpdateHeldError(
      'unchanged',
      fileVersion,
      `The hub lists a newer version of "${name}", but its file is still version ${fileVersion}, so it wasn't installed`
    );
  }
  if (state === 'major' && automatic) {
    throw new HubUpdateHeldError(
      'major',
      fileVersion,
      `The hub's file for "${name}" is major version ${fileVersion}, which needs your approval`
    );
  }
}

import { execFile } from 'node:child_process';

/** Runs a command and resolves its output, or '' when it fails or takes too long. */
function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 1500, windowsHide: true }, (error, stdout) =>
      resolve(error ? '' : String(stdout))
    );
  });
}

/** The first field of a passwd entry's comment (GECOS): "Full Name,room,phone,…". */
export function nameFromPasswd(entry: string): string {
  return (entry.split(':')[4] ?? '').split(',')[0].trim();
}

/**
 * The account's display name ("Jose Daniel Estrada"), best effort: macOS and Linux keep one,
 * Windows is left out because asking for it takes seconds. '' when there is none.
 */
export async function accountFullName(username: string): Promise<string> {
  if (process.platform === 'darwin') return (await run('id', ['-F'])).trim();
  if (process.platform === 'linux' && username) {
    return nameFromPasswd((await run('getent', ['passwd', username])).trim());
  }
  return '';
}

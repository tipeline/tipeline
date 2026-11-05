import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Node-only, so it has its own entry point (@tipeline/utils/coreProcess): the main
// barrel also runs in Desktop's renderer.

const CORE_ENTRY = 'dist/engine/Server.js';

/** Written and removed by Core itself. CLI and Desktop only read it. */
export function corePidFile(): string {
  return path.join(homedir(), 'Tipeline', 'tipeline.pid');
}

/**
 * Core leaves this when it refuses a database upgraded by a newer version, so Desktop can say
 * why it didn't start. Only means something while no Core is running.
 */
export function newerDatabaseMarker(): string {
  return path.join(homedir(), 'Tipeline', 'core-refused-newer-database');
}

function commandLine(pid: number): string | null {
  try {
    const output =
      process.platform === 'win32'
        ? execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
            ],
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
              timeout: 5000,
              windowsHide: true,
            }
          )
        : execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
          });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * True if the pid is a live Core, not just a live process: after a crash or a reboot the
 * pid in the file can belong to any other program. If the command line can't be read,
 * the pid counts as Core, because starting a second one is the worse mistake.
 */
export function isCoreProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const command = commandLine(pid);
  return command === null || command.replace(/\\/g, '/').includes(CORE_ENTRY);
}

/** The pid in the file, whatever it points at. */
export function readCorePid(pidFile: string = corePidFile()): number | null {
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function runningCorePid(pidFile: string = corePidFile()): number | null {
  const pid = readCorePid(pidFile);
  return pid !== null && isCoreProcess(pid) ? pid : null;
}

/**
 * Makes `pid` the one running Core. The file appears complete or not at all (link fails
 * if it exists), so of two Cores starting together exactly one wins. Replacing a stale
 * file isn't atomic: two Cores starting in the same instant after a crash could both win.
 */
export function claimCorePidFile(
  pid: number = process.pid,
  pidFile: string = corePidFile()
): { claimed: true } | { claimed: false; pid: number } {
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  const temp = `${pidFile}.${pid}`;
  fs.writeFileSync(temp, String(pid));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.linkSync(temp, pidFile);
        return { claimed: true };
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }
      const holder = runningCorePid(pidFile);
      if (holder === pid) return { claimed: true };
      if (holder !== null) return { claimed: false, pid: holder };
      fs.rmSync(pidFile, { force: true });
    }
    throw new Error(`Could not claim ${pidFile}`);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Removes the file only if it's still this pid's. */
export function releaseCorePidFile(
  pid: number = process.pid,
  pidFile: string = corePidFile()
): void {
  if (readCorePid(pidFile) === pid) fs.rmSync(pidFile, { force: true });
}

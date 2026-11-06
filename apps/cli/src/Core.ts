import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import fs from 'fs-extra';
import { corePidFile, runningCorePid } from '@tipeline/utils/coreProcess';
import {
  coreServiceIsDesktop,
  coreServiceSupport,
  installCoreService,
  isCoreServiceInstalled,
  startCoreService,
  uninstallCoreService,
} from '@tipeline/utils/coreService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SOCKET_PATH =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\app.tipeline_core'
    : `${process.env.TIPELINE_IPC_SOCKET_ROOT || '/tmp/'}app.tipeline_core`;
const READY_POLL_MS = 250;
const READY_TIMEOUT_MS = 25_000;
const SQLITE_SETUP_TIMEOUT_MS = 120_000;

function probeSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(SOCKET_PATH);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export default class Core {
  // Resolved as a package because a global npm install nests core inside the
  // CLI's own node_modules, so it isn't at a fixed path relative to this file.
  private static corePath(relativePath: string): string {
    return path.join(path.dirname(require.resolve('@tipeline/core/package.json')), relativePath);
  }

  private static serverPath(): string {
    return Core.corePath('dist/engine/Server.js');
  }

  private static sqliteLoads(sqliteDir: string): boolean {
    const check = "new (require('./lib'))(':memory:').close()";
    return spawnSync(process.execPath, ['-e', check], { cwd: sqliteDir, stdio: 'ignore' }).status === 0;
  }

  /**
   * npm 12 skips install scripts by default, which leaves better-sqlite3 without its binary, and
   * a new major Node version needs a different one. Upgrades don't run `tipeline install`, so
   * `start` checks too.
   */
  private static ensureSqlite(): void {
    const coreRequire = createRequire(Core.corePath('package.json'));
    const sqliteDir = path.dirname(coreRequire.resolve('better-sqlite3/package.json'));
    if (Core.sqliteLoads(sqliteDir)) return;

    const sqliteRequire = createRequire(path.join(sqliteDir, 'package.json'));
    spawnSync(process.execPath, [sqliteRequire.resolve('prebuild-install/bin.js')], {
      cwd: sqliteDir,
      stdio: 'ignore',
      timeout: SQLITE_SETUP_TIMEOUT_MS,
    });
    if (Core.sqliteLoads(sqliteDir)) return;

    throw new Error(
      'Could not set up the SQLite module Tipeline needs. Check your internet connection, then ' +
        'reinstall with: npm i -g @tipeline/cli --allow-scripts=better-sqlite3'
    );
  }

  private static logSize(logFile: string): number {
    try {
      return fs.statSync(logFile).size;
    } catch {
      return 0;
    }
  }

  private static startFailure(logFile: string, logStart: number): Error {
    let reason = '';
    try {
      const logged = fs.readFileSync(logFile).subarray(logStart).toString('utf-8');
      reason = logged.split('\n').find((line) => line.includes('[ERROR]')) ?? '';
    } catch {
      // No log to read: the generic message below still points at the file.
    }
    const details = reason ? `\n${reason.replace(/^\[[^\]]*\] \[ERROR\] /, '')}` : '';
    return new Error(`Tipeline core did not start. Details are in ${logFile}${details}`);
  }

  /** Core binds its socket last, so this is what proves it survived starting up. */
  private static async waitUntilReady(
    logFile: string,
    logStart: number,
    hasExited: () => boolean
  ): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await probeSocket()) return;
      // A Core that lost the race to another one exits too, and that one is fine.
      if (hasExited() && runningCorePid() === null) throw Core.startFailure(logFile, logStart);
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
    if (runningCorePid() === null) throw Core.startFailure(logFile, logStart);
  }

  public async start(): Promise<string> {
    const configFile = path.join(homedir(), '.tipeline', 'database.json');
    if (!fs.existsSync(configFile)) {
      throw new Error("Tipeline is not configured. Run 'tipeline install' first.");
    }

    const runningPid = runningCorePid();
    if (runningPid !== null) {
      return `Tipeline service is already running (PID: ${runningPid})`;
    }

    Core.ensureSqlite();

    const serverPath = Core.serverPath();
    const logFile = path.join(homedir(), '.tipeline', 'logs', 'start.log');
    const logStart = Core.logSize(logFile);

    // Desktop's service would run Desktop's Core, not the one this CLI was installed with.
    if (isCoreServiceInstalled() && !coreServiceIsDesktop()) {
      try {
        startCoreService();
        await Core.waitUntilReady(logFile, logStart, () => false);
        return 'Tipeline service started';
      } catch {
        // Starting matters more than how: fall through to a plain process.
      }
    }

    const child = spawn(process.execPath, [serverPath], {
      cwd: __dirname,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });

    child.on('error', (e) => {
      throw new Error(`Failed to start subprocess: ${e.message}`);
    });

    let exited = false;
    child.once('exit', () => {
      exited = true;
    });

    child.unref();

    await Core.waitUntilReady(logFile, logStart, () => exited);

    return `Tipeline service started (PID: ${child.pid})`;
  }

  public stop(): string {
    const pidFile = corePidFile();

    if (!fs.existsSync(pidFile)) {
      throw new Error('Tipeline core is not running.');
    }

    const pid = runningCorePid(pidFile);
    if (pid === null) {
      fs.unlinkSync(pidFile);
      return 'Tipeline core was not running. Stale PID file removed.';
    }

    process.kill(pid, 'SIGTERM');
    return `Tipeline core stopped (PID: ${pid})`;
  }

  public serviceInstall(): string {
    const support = coreServiceSupport();
    if (!support.available) {
      throw new Error('Auto-start needs launchd, a systemd user session, or Windows.');
    }
    installCoreService({ program: process.execPath, args: [Core.serverPath()] });
    if (runningCorePid() === null) {
      startCoreService();
      return 'Auto-start is on. Tipeline service started.';
    }
    return support.restartsOnCrash
      ? "Auto-start is on. To restart after a crash too, run 'tipeline stop' and 'tipeline start'."
      : 'Auto-start is on.';
  }

  public serviceUninstall(): string {
    const running = runningCorePid() !== null;
    uninstallCoreService(running);
    return running ? 'Auto-start is off. Core is still running.' : 'Auto-start is off.';
  }

  public serviceStatus(): string {
    if (!coreServiceSupport().available) return 'Auto-start is not available on this system.';
    if (!isCoreServiceInstalled()) return 'Auto-start is off.';
    return coreServiceIsDesktop() ? 'Auto-start is on, set up by Tipeline Desktop.' : 'Auto-start is on.';
  }

  public install(options: { force?: boolean } = {}): string {
    Core.ensureSqlite();

    const installPath = Core.corePath('dist/engine/Install.js');
    const args = options.force ? ['--force'] : [];

    const result = spawnSync(process.execPath, [installPath, ...args], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });

    if (result.error || result.status !== 0) {
      throw new Error(result.stderr || result.error?.message || 'Install failed');
    }

    return result.stdout.trim();
  }
}

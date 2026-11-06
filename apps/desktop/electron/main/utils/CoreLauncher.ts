import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { homedir } from 'node:os';
import fs from 'node:fs';
import { app } from 'electron';
import { generateIdentifier, isOlderVersion } from '@tipeline/utils';
import { newerDatabaseMarker, runningCorePid } from '@tipeline/utils/coreProcess';
import {
  coreServiceIsDesktop,
  coreServiceMatches,
  coreServiceSupport,
  installCoreService,
  isCoreServiceInstalled,
  resolveOnPath,
  startCoreService,
  uninstallCoreService,
  type CoreServiceCommand,
} from '@tipeline/utils/coreService';
import { CoreService } from './CoreService';
import { CORE } from './ipc-channels';

const SOCKET_PATH =
  process.platform === 'win32'
    ? '\\\\.\\pipe\\app.tipeline_core'
    : `${process.env.TIPELINE_IPC_SOCKET_ROOT || '/tmp/'}app.tipeline_core`;

const POLL_INTERVAL_MS = 500;
const WAIT_TIMEOUT_MS = 25_000;
const EXIT_TIMEOUT_MS = 15_000;

const AUTO_START_MARKER = path.join(homedir(), '.tipeline', '.auto-start-decided');

function probeSocket(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(SOCKET_PATH);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(2000, () => { socket.destroy(); resolve(false); });
  });
}

function waitForSocket(giveUp?: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    const tick = async () => {
      if (await probeSocket()) { resolve(true); return; }
      if (Date.now() >= deadline || giveUp?.()) { resolve(false); return; }
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  });
}

function serverJsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'core', 'dist', 'engine', 'Server.js')
    : path.join(process.env.APP_ROOT!, '..', 'core', 'dist', 'engine', 'Server.js');
}

// Packaged builds run Electron's own embedded Node runtime in Node mode, so end users never
// need Node.js installed. In dev, core's node_modules (shared with apps/cli via workspace
// hoisting) has native deps like better-sqlite3 built against the plain Node ABI, not
// Electron's — so dev uses plain `node`, matching what `tipeline start` uses.
function coreCommand(): CoreServiceCommand {
  return app.isPackaged
    ? { program: process.execPath, args: [serverJsPath()], env: { ELECTRON_RUN_AS_NODE: '1' } }
    : { program: resolveOnPath('node'), args: [serverJsPath()] };
}

function spawnCore(): void {
  const { program, args, env } = coreCommand();
  console.log(`[CoreLauncher] spawning: ${program} ${args.join(' ')}`);
  const child = spawn(program, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...env },
  });
  child.on('error', (err) => console.error('[CoreLauncher] spawn error:', err.message));
  child.unref();
}

/**
 * Auto-start belongs to whoever set it up. The CLI's service stays the CLI's: Desktop neither
 * rewrites it nor starts through it, or each side would keep undoing the other. Dev builds and
 * the CLI run on plain Node, so a dev build can't tell them apart and keeps treating it as its own.
 */
function ownsAutoStart(): boolean {
  return isCoreServiceInstalled() && (!app.isPackaged || coreServiceIsDesktop());
}

/**
 * Auto-start is on by default in the installed app, set up the first time it opens unless the
 * CLI already did. The marker keeps a later "off" off. Dev builds never set it up: a service
 * would keep bringing back a Core from the working tree during rebuilds. Returns true when this
 * call turned it on.
 */
function setUpAutoStart(): boolean {
  try {
    if (!coreServiceSupport().available) return false;
    if (app.isPackaged && !fs.existsSync(AUTO_START_MARKER)) {
      const turnOn = !isCoreServiceInstalled();
      if (turnOn) installCoreService(coreCommand());
      markAutoStartDecided();
      return turnOn;
    }
    // The app moved or was replaced since the service was written.
    if (ownsAutoStart() && !coreServiceMatches(coreCommand())) {
      installCoreService(coreCommand());
    }
  } catch (err: any) {
    console.warn('[CoreLauncher] Could not set up auto-start:', err?.message ?? err);
  }
  return false;
}

function markAutoStartDecided(): void {
  fs.mkdirSync(path.dirname(AUTO_START_MARKER), { recursive: true });
  fs.writeFileSync(AUTO_START_MARKER, '');
}

function startCore(): void {
  if (ownsAutoStart()) {
    try {
      startCoreService();
      return;
    } catch (err: any) {
      console.warn('[CoreLauncher] Service did not start, spawning instead:', err?.message ?? err);
    }
  }
  spawnCore();
}

/** The last Core left because of a database upgraded by a newer version, and none replaced it. */
function refusedNewerDatabase(): boolean {
  return runningCorePid() === null && fs.existsSync(newerDatabaseMarker());
}

export async function launchIfNeeded(): Promise<{
  wasRunning: boolean;
  autoStartTurnedOn: boolean;
  databaseNewer?: boolean;
}> {
  const autoStartTurnedOn = setUpAutoStart();

  if (await probeSocket()) return { wasRunning: true, autoStartTurnedOn };

  // Socket isn't up, but another launcher (CLI or a previous Desktop run)
  // may already be starting core — a fresh process can exist without having
  // bound its socket yet. Wait for it instead of racing a second spawn.
  if (runningCorePid() !== null) {
    console.log('[CoreLauncher] core already starting per pidfile, waiting for socket');
    const ready = await waitForSocket(refusedNewerDatabase);
    if (!ready) console.warn('[CoreLauncher] Core did not become ready within timeout');
    return { wasRunning: true, autoStartTurnedOn, databaseNewer: !ready && refusedNewerDatabase() };
  }

  // From an earlier attempt: this one has to find out for itself.
  fs.rmSync(newerDatabaseMarker(), { force: true });
  startCore();

  const ready = await waitForSocket(refusedNewerDatabase);
  if (!ready) console.warn('[CoreLauncher] Core did not become ready within timeout');

  return { wasRunning: false, autoStartTurnedOn, databaseNewer: !ready && refusedNewerDatabase() };
}

export interface AutoStartState {
  available: boolean;
  restartsOnCrash: boolean;
  enabled: boolean;
}

export function getAutoStart(): AutoStartState {
  const support = coreServiceSupport();
  return { ...support, enabled: support.available && isCoreServiceInstalled() };
}

/** Takes effect from the next login, and a running Core is left alone either way. */
export async function setAutoStart(enabled: boolean): Promise<AutoStartState> {
  if (enabled) installCoreService(coreCommand());
  else uninstallCoreService((await probeSocket()) || runningCorePid() !== null);
  markAutoStartDecided();
  return getAutoStart();
}

export interface CoreVersionCheck {
  outdated: boolean;
  // The running Core is ahead of this Desktop, which only an update of Desktop can fix.
  desktopOutdated: boolean;
  running?: string;
  bundled?: string;
  // Missing on Cores older than this field: treat as "can't tell", not as idle.
  activeRuns?: number;
  // This app's auto-start is on, but its Core was started some other way, so a crash would end
  // it. A Core the CLI started doesn't count: it's up to date, so it's left running.
  unsupervised: boolean;
}

/** Compares the running Core with the one shipped next to this Desktop. */
export async function checkCoreVersion(): Promise<CoreVersionCheck> {
  const packageJson = path.join(path.dirname(serverJsPath()), '..', '..', 'package.json');
  const bundled: string = JSON.parse(fs.readFileSync(packageJson, 'utf-8')).version;
  const status = await CoreService.localRequest<{
    version?: string;
    activeRuns?: number;
    supervised?: boolean;
    entry?: string;
  }>(CORE.STATUS, { correlationId: generateIdentifier() });
  return {
    outdated: isOlderVersion(status?.version, bundled),
    desktopOutdated: isOlderVersion(bundled, status?.version),
    running: status?.version,
    bundled,
    activeRuns: status?.activeRuns,
    unsupervised:
      ownsAutoStart() &&
      coreServiceSupport().restartsOnCrash &&
      !status?.supervised &&
      status?.entry === serverJsPath(),
  };
}

async function waitForExit(): Promise<boolean> {
  const deadline = Date.now() + EXIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (runningCorePid() === null && !(await probeSocket())) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

// Desktop only stops Core when it's idle or the user chose to interrupt, so what's still running
// now started in the last moment. It mustn't leave Core waiting after this has moved on.
function stopCore(): Promise<unknown> {
  return CoreService.localRequest(CORE.STOP, { correlationId: generateIdentifier(), payload: { interrupt: true } });
}

/**
 * Clears the way for installing an update: a Core running from inside this app can't stay on while
 * the app is replaced, so it stops. Not ready unless that's certain to interrupt nothing, including
 * when Core can't say how many runs are active, or the user chose to interrupt. The new version
 * starts it again.
 */
export async function stopCoreForUpdate(interrupt = false): Promise<{ ready: boolean; activeRuns?: number }> {
  if (runningCorePid() === null && !(await probeSocket())) return { ready: true };
  try {
    const status = await CoreService.localRequest<{ activeRuns?: number; entry?: string }>(CORE.STATUS, {
      correlationId: generateIdentifier(),
    });
    if (status?.entry !== serverJsPath()) return { ready: true };
    if (status.activeRuns !== 0 && !interrupt) return { ready: false, activeRuns: status.activeRuns };
    await stopCore();
    return { ready: await waitForExit() };
  } catch (err: any) {
    console.warn('[CoreLauncher] Could not stop Core for the update:', err?.message ?? err);
    return { ready: false };
  }
}

/** Stops the running Core and starts the one shipped with this Desktop. */
export async function restartCore(): Promise<{ restarted: boolean }> {
  try {
    await stopCore();
  } catch (err: any) {
    console.warn('[CoreLauncher] Core did not accept the stop request:', err?.message ?? err);
    return { restarted: false };
  }
  // Starting while the old one is still exiting would make the new one give way to it.
  if (!(await waitForExit())) {
    console.warn('[CoreLauncher] Core did not stop within timeout');
    return { restarted: false };
  }
  await launchIfNeeded();
  return { restarted: await probeSocket() };
}

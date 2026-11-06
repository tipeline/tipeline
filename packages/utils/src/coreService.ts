import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Node-only, like ./coreProcess. Starts Core at login and, where the OS can do it, again
// after a crash: launchd on macOS, a systemd user service on Linux, the per-user Run key on
// Windows (a scheduled task with a logon trigger usually needs admin rights).
//
// Core's exit codes drive this: a fatal error exits 1 and gets restarted, while a normal
// stop or a duplicate Core exits 0 and stays down.

export interface CoreServiceCommand {
  program: string;
  args: string[];
  env?: Record<string, string>;
}

export interface CoreServiceSupport {
  available: boolean;
  restartsOnCrash: boolean;
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

function serviceName(): string {
  return process.env.TIPELINE_SERVICE_NAME || 'com.tipeline.core';
}

/** The file that defines the service. */
export function coreServiceFile(platform: NodeJS.Platform = process.platform): string {
  const name = serviceName();
  if (platform === 'darwin')
    return path.join(homedir(), 'Library', 'LaunchAgents', `${name}.plist`);
  if (platform === 'win32') return path.join(homedir(), '.tipeline', `${name}.vbs`);
  return path.join(homedir(), '.config', 'systemd', 'user', `${name}.service`);
}

/**
 * What Core inherits from a shell or the app has to be spelled out for the service: PATH for
 * the tools workflows run, TIPELINE_* so it keeps the same socket, ports and folders.
 */
function serviceEnv(command: CoreServiceCommand, supervised: boolean): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && (key === 'PATH' || key === 'HOME' || key.startsWith('TIPELINE_'))) {
      env[key] = value;
    }
  }
  delete env.TIPELINE_SUPERVISED;
  if (supervised) env.TIPELINE_SUPERVISED = '1';
  return { ...env, ...command.env };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLaunchAgent(
  command: CoreServiceCommand,
  label: string = serviceName()
): string {
  const strings = [command.program, ...command.args]
    .map((value) => `    <string>${escapeXml(value)}</string>`)
    .join('\n');
  const env = Object.entries(serviceEnv(command, true))
    .map(
      ([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`
    )
    .join('\n');
  // AbandonProcessGroup: programs a workflow opened keep running when Core exits, as they do
  // when Core is started any other way.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${strings}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(homedir())}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>AbandonProcessGroup</key>
  <true/>
</dict>
</plist>
`;
}

function quoteSystemd(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%')
    .replace(/\$/g, '$$$$');
  return `"${escaped}"`;
}

export function renderSystemdUnit(command: CoreServiceCommand): string {
  const exec = [command.program, ...command.args].map(quoteSystemd).join(' ');
  const env = Object.entries(serviceEnv(command, true))
    .map(([key, value]) => `Environment=${quoteSystemd(`${key}=${value}`)}`)
    .join('\n');
  // KillMode=process: programs a workflow opened outlive Core, as on the other platforms.
  return `[Unit]
Description=Tipeline Core

[Service]
ExecStart=${exec}
${env}
WorkingDirectory=%h
Restart=on-failure
RestartSec=10
KillMode=process

[Install]
WantedBy=default.target
`;
}

/** A Run key can't set variables or hide a console window, so it runs this script. */
export function renderWindowsScript(command: CoreServiceCommand): string {
  const quoteVbs = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const line = [command.program, ...command.args].map((value) => `"${value}"`).join(' ');
  const env = Object.entries(serviceEnv(command, false))
    .map(([key, value]) => `shell.Environment("Process")(${quoteVbs(key)}) = ${quoteVbs(value)}`)
    .join('\r\n');
  return [
    'Set shell = CreateObject("WScript.Shell")',
    env,
    `shell.CurrentDirectory = ${quoteVbs(homedir())}`,
    `shell.Run ${quoteVbs(line)}, 0, False`,
    '',
  ].join('\r\n');
}

function render(command: CoreServiceCommand): string {
  if (process.platform === 'darwin') return renderLaunchAgent(command);
  if (process.platform === 'win32') return renderWindowsScript(command);
  return renderSystemdUnit(command);
}

function run(program: string, args: string[]): string {
  return execFileSync(program, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    windowsHide: true,
  });
}

function tryRun(program: string, args: string[]): boolean {
  try {
    run(program, args);
    return true;
  } catch {
    return false;
  }
}

function launchdDomain(): string {
  return `gui/${process.getuid!()}`;
}

function launchdTarget(): string {
  return `${launchdDomain()}/${serviceName()}`;
}

function unitName(): string {
  return `${serviceName()}.service`;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function coreServiceSupport(): CoreServiceSupport {
  if (process.platform === 'darwin') return { available: true, restartsOnCrash: true };
  if (process.platform === 'win32') return { available: true, restartsOnCrash: false };
  // Containers and non-systemd distributions have no user manager to talk to.
  const hasSystemd =
    process.platform === 'linux' && tryRun('systemctl', ['--user', 'show-environment']);
  return { available: hasSystemd, restartsOnCrash: hasSystemd };
}

export function isCoreServiceInstalled(): boolean {
  return fs.existsSync(coreServiceFile());
}

/**
 * True if the installed service still starts this program. Variables are left out: Desktop
 * opened from Finder has a shorter PATH than a shell, which isn't a reason to overwrite.
 */
export function coreServiceMatches(command: CoreServiceCommand): boolean {
  try {
    const installed = fs.readFileSync(coreServiceFile(), 'utf8');
    const wanted = render({ ...command, env: {} });
    const programLine = (text: string) =>
      process.platform === 'darwin'
        ? text.slice(text.indexOf('<array>'), text.indexOf('</array>'))
        : process.platform === 'win32'
          ? (text.match(/shell\.Run .*/) ?? [''])[0]
          : (text.match(/^ExecStart=.*$/m) ?? [''])[0];
    return programLine(installed) === programLine(wanted);
  } catch {
    return false;
  }
}

/**
 * True if the installed service runs the Core bundled with Desktop. Only Electron needs this
 * variable to run as Node, and all three service formats spell out variables, so it tells
 * Desktop's service from the CLI's everywhere.
 */
export function coreServiceIsDesktop(): boolean {
  try {
    return fs.readFileSync(coreServiceFile(), 'utf8').includes('ELECTRON_RUN_AS_NODE');
  } catch {
    return false;
  }
}

/** Writes the service so it runs from the next login on. Doesn't touch a running Core. */
export function installCoreService(command: CoreServiceCommand): void {
  const file = coreServiceFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(command));
  if (process.platform === 'win32') {
    run('reg', [
      'add',
      RUN_KEY,
      '/v',
      serviceName(),
      '/t',
      'REG_SZ',
      '/d',
      `wscript.exe "${file}"`,
      '/f',
    ]);
  } else if (process.platform === 'linux') {
    run('systemctl', ['--user', 'daemon-reload']);
    run('systemctl', ['--user', 'enable', unitName()]);
  }
}

/** Starts Core through the service. Only for when no Core is running. */
export function startCoreService(): void {
  if (process.platform === 'darwin') {
    // Reloading picks up a changed file. launchd finishes unloading in the background, so
    // loading right after can fail for a moment.
    tryRun('launchctl', ['bootout', launchdTarget()]);
    for (let attempt = 0; ; attempt++) {
      try {
        run('launchctl', ['bootstrap', launchdDomain(), coreServiceFile()]);
        return;
      } catch (err) {
        if (attempt >= 5) throw err;
        sleepSync(300);
      }
    }
  }
  if (process.platform === 'win32') {
    spawn('wscript.exe', [coreServiceFile()], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  run('systemctl', ['--user', 'start', unitName()]);
}

/** Stops a Core the service runs, so that killing it doesn't bring it back. Best effort. */
export function stopCoreServiceNow(): void {
  if (process.platform === 'darwin') tryRun('launchctl', ['bootout', launchdTarget()]);
  else if (process.platform === 'linux') tryRun('systemctl', ['--user', 'stop', unitName()]);
}

/**
 * Removes the service and leaves a running Core alone, since it may be in the middle of a run.
 * launchd can't unload a job without stopping it, so while Core runs macOS keeps the job until
 * logout: it won't come back after the next login, and a normal stop still ends it.
 */
export function uninstallCoreService(coreRunning: boolean): void {
  if (process.platform === 'win32') {
    tryRun('reg', ['delete', RUN_KEY, '/v', serviceName(), '/f']);
  } else if (process.platform === 'linux') {
    tryRun('systemctl', ['--user', 'disable', unitName()]);
  } else if (process.platform === 'darwin' && !coreRunning) {
    tryRun('launchctl', ['bootout', launchdTarget()]);
  }
  fs.rmSync(coreServiceFile(), { force: true });
  if (process.platform === 'linux') tryRun('systemctl', ['--user', 'daemon-reload']);
}

/** Where a program name resolves on PATH, for service files that need an absolute path. */
export function resolveOnPath(program: string): string {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, program);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not here
    }
  }
  return program;
}

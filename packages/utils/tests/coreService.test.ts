import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coreServiceFile,
  coreServiceIsDesktop,
  coreServiceMatches,
  renderLaunchAgent,
  renderSystemdUnit,
  renderWindowsScript,
  resolveOnPath,
} from '../src/coreService';

const command = {
  program: '/Applications/My & App.app/Contents/MacOS/Tipeline',
  args: ['/Resources/core/dist/engine/Server.js'],
  env: { ELECTRON_RUN_AS_NODE: '1' },
};

describe('renderLaunchAgent', () => {
  const plist = renderLaunchAgent(command, 'com.tipeline.test');

  it.skipIf(process.platform !== 'darwin')('is a plist macOS accepts', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plist-')), 'a.plist');
    fs.writeFileSync(file, plist);
    expect(execFileSync('plutil', ['-lint', file], { encoding: 'utf8' })).toContain('OK');
    const parsed = JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' })
    );
    expect(parsed.ProgramArguments).toEqual([command.program, ...command.args]);
    expect(parsed.KeepAlive).toEqual({ SuccessfulExit: false });
    expect(parsed.AbandonProcessGroup).toBe(true);
    expect(parsed.EnvironmentVariables.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(parsed.EnvironmentVariables.TIPELINE_SUPERVISED).toBe('1');
  });

  it('escapes paths', () => {
    expect(plist).toContain('My &amp; App.app');
  });
});

describe('renderSystemdUnit', () => {
  it('restarts on failure only and quotes values', () => {
    const unit = renderSystemdUnit({ program: '/opt/my app/node', args: ['/a/100%/Server.js'] });
    expect(unit).toContain('ExecStart="/opt/my app/node" "/a/100%%/Server.js"');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('Environment="TIPELINE_SUPERVISED=1"');
  });
});

describe('renderWindowsScript', () => {
  it('runs hidden and does not claim to be supervised', () => {
    const script = renderWindowsScript({
      program: 'C:\\Tipeline\\Tipeline.exe',
      args: ['C:\\core\\Server.js'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
    expect(script).toContain(
      'shell.Run """C:\\Tipeline\\Tipeline.exe"" ""C:\\core\\Server.js""", 0, False'
    );
    expect(script).toContain('shell.Environment("Process")("ELECTRON_RUN_AS_NODE") = "1"');
    expect(script).not.toContain('TIPELINE_SUPERVISED');
  });
});

describe('coreServiceMatches', () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'core-service-'));
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(home, { recursive: true, force: true });
  });

  function write(text: string) {
    fs.mkdirSync(path.dirname(coreServiceFile()), { recursive: true });
    fs.writeFileSync(coreServiceFile(), text);
  }

  const asInstalled = (c: typeof command) =>
    process.platform === 'darwin'
      ? renderLaunchAgent(c)
      : process.platform === 'win32'
        ? renderWindowsScript(c)
        : renderSystemdUnit(c);

  it('tells a Desktop service from a CLI one', () => {
    expect(coreServiceIsDesktop()).toBe(false);
    write(asInstalled({ program: '/usr/bin/node', args: ['/cli/Server.js'], env: {} } as typeof command));
    expect(coreServiceIsDesktop()).toBe(false);
    write(asInstalled(command));
    expect(coreServiceIsDesktop()).toBe(true);
  });

  it('is false with nothing installed', () => {
    expect(coreServiceMatches(command)).toBe(false);
  });

  it('is true for the same program, whatever the variables', () => {
    write(asInstalled(command));
    vi.stubEnv('PATH', '/usr/bin');
    expect(coreServiceMatches(command)).toBe(true);
  });

  it('is false once the app has moved', () => {
    write(asInstalled(command));
    expect(coreServiceMatches({ ...command, program: '/elsewhere/Tipeline' })).toBe(false);
  });
});

describe('resolveOnPath', () => {
  it('finds an executable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-'));
    const file = path.join(dir, 'tool');
    fs.writeFileSync(file, '');
    fs.chmodSync(file, 0o755);
    vi.stubEnv('PATH', dir);
    expect(resolveOnPath('tool')).toBe(file);
    expect(resolveOnPath('missing')).toBe('missing');
    vi.unstubAllEnvs();
  });
});

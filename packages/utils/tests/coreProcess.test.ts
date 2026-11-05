import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  claimCorePidFile,
  isCoreProcess,
  readCorePid,
  releaseCorePidFile,
  runningCorePid,
} from '../src/coreProcess';

// Real processes and real files: the whole point is telling real pids apart.
let dir: string;
let pidFile: string;
const children: ChildProcess[] = [];

function startProcess(script: string): Promise<number> {
  const file = path.join(dir, script);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'setInterval(() => {}, 1000); process.send?.("up");');
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  children.push(child);
  return new Promise((resolve) => child.once('message', () => resolve(child.pid!)));
}

const startCore = () => startProcess('core/dist/engine/Server.js');
const startOtherProgram = () => startProcess('other/program.js');

function deadPid(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    child.once('exit', () => resolve(child.pid!));
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-process-'));
  pidFile = path.join(dir, 'home', 'tipeline.pid');
});

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('isCoreProcess', () => {
  it('accepts a live Core', async () => {
    expect(isCoreProcess(await startCore())).toBe(true);
  });

  it('rejects a live process that is something else', async () => {
    expect(isCoreProcess(await startOtherProgram())).toBe(false);
  });

  it('rejects a dead pid', async () => {
    expect(isCoreProcess(await deadPid())).toBe(false);
  });
});

describe('runningCorePid', () => {
  beforeEach(() => fs.mkdirSync(path.dirname(pidFile), { recursive: true }));

  it('is null with no file', () => {
    expect(runningCorePid(pidFile)).toBeNull();
  });

  it('is null for a file with no pid in it', () => {
    fs.writeFileSync(pidFile, 'not a pid');
    expect(runningCorePid(pidFile)).toBeNull();
  });

  it('is null when the pid was reused by another program', async () => {
    fs.writeFileSync(pidFile, String(await startOtherProgram()));
    expect(runningCorePid(pidFile)).toBeNull();
  });

  it('finds the plain-pid file an already running older Core left behind', async () => {
    const pid = await startCore();
    fs.writeFileSync(pidFile, `${pid}\n`);
    expect(runningCorePid(pidFile)).toBe(pid);
  });
});

describe('claimCorePidFile', () => {
  it('creates the file and its folder, leaving no temp file', async () => {
    const pid = await startCore();
    expect(claimCorePidFile(pid, pidFile)).toEqual({ claimed: true });
    expect(readCorePid(pidFile)).toBe(pid);
    expect(fs.readdirSync(path.dirname(pidFile))).toEqual(['tipeline.pid']);
  });

  it('loses to a Core that is already running', async () => {
    const first = await startCore();
    const second = await startCore();
    claimCorePidFile(first, pidFile);
    expect(claimCorePidFile(second, pidFile)).toEqual({ claimed: false, pid: first });
    expect(readCorePid(pidFile)).toBe(first);
  });

  it('replaces a file left by a dead Core', async () => {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(await deadPid()));
    const pid = await startCore();
    expect(claimCorePidFile(pid, pidFile)).toEqual({ claimed: true });
    expect(readCorePid(pidFile)).toBe(pid);
  });

  it('replaces a file whose pid now belongs to another program', async () => {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(await startOtherProgram()));
    const pid = await startCore();
    expect(claimCorePidFile(pid, pidFile)).toEqual({ claimed: true });
  });

  it('accepts a file that already names this pid', async () => {
    const pid = await startCore();
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
    fs.writeFileSync(pidFile, String(pid));
    expect(claimCorePidFile(pid, pidFile)).toEqual({ claimed: true });
  });
});

describe('releaseCorePidFile', () => {
  it('removes its own file', async () => {
    const pid = await startCore();
    claimCorePidFile(pid, pidFile);
    releaseCorePidFile(pid, pidFile);
    expect(fs.existsSync(pidFile)).toBe(false);
  });

  it("leaves another Core's file alone", async () => {
    const pid = await startCore();
    claimCorePidFile(pid, pidFile);
    releaseCorePidFile(pid + 1, pidFile);
    expect(readCorePid(pidFile)).toBe(pid);
  });
});

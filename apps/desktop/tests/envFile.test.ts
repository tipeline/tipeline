import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import {
  ensureEnvFile,
  envFileNames,
  envFilePath,
  makeEnvFilePrivate,
  readEnvFileInfo,
} from '../electron/main/utils/envFile';

const posix = process.platform !== 'win32';
let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'env-file-home-'));
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('the environment file (Settings → Environment)', () => {
  it('is the file Core reads, ~/.tipeline/.env', () => {
    expect(envFilePath(home)).toBe(nodePath.join(home, '.tipeline', '.env'));
  });

  it('lists the names a file sets, never comments, blanks or duplicates', () => {
    const text = '# API_KEY=commented\n\nAPI_KEY=one\nexport SMTP_HOST = smtp.example.com\nAPI_KEY=two\n  db.url=x\r\nnot a line\n';
    expect(envFileNames(text)).toEqual(['API_KEY', 'SMTP_HOST', 'db.url']);
  });

  it('says when there is no file yet', () => {
    expect(readEnvFileInfo(home)).toEqual({ path: envFilePath(home), exists: false, names: [], shared: false });
  });

  it('creates a commented file readable by this account only, with no names in it', () => {
    const file = ensureEnvFile(home);
    expect(fs.readFileSync(file, 'utf8')).toContain('{{ _env.NAME }}');
    const info = readEnvFileInfo(home);
    expect(info).toMatchObject({ exists: true, names: [], shared: false });
    if (posix) expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('never overwrites a file that is already there', () => {
    fs.mkdirSync(nodePath.dirname(envFilePath(home)), { recursive: true });
    fs.writeFileSync(envFilePath(home), 'API_KEY=keep-me\n');
    ensureEnvFile(home);
    expect(fs.readFileSync(envFilePath(home), 'utf8')).toBe('API_KEY=keep-me\n');
    expect(readEnvFileInfo(home).names).toEqual(['API_KEY']);
  });

  it.runIf(posix)('flags a file other accounts can read, and makes it private', () => {
    fs.mkdirSync(nodePath.dirname(envFilePath(home)), { recursive: true });
    fs.writeFileSync(envFilePath(home), 'API_KEY=x\n', { mode: 0o644 });
    fs.chmodSync(envFilePath(home), 0o644);
    expect(readEnvFileInfo(home).shared).toBe(true);
    makeEnvFilePrivate(home);
    expect(fs.statSync(envFilePath(home)).mode & 0o777).toBe(0o600);
    expect(readEnvFileInfo(home).shared).toBe(false);
  });

  it('never calls a file shared on Windows, where file modes do not apply', () => {
    fs.mkdirSync(nodePath.dirname(envFilePath(home)), { recursive: true });
    fs.writeFileSync(envFilePath(home), 'API_KEY=x\n', { mode: 0o644 });
    expect(readEnvFileInfo(home, 'win32').shared).toBe(false);
  });
});

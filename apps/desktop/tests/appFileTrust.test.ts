import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The trust list lives in Electron's userData folder: a temp folder here.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-userdata-'));
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

const store = () => path.join(userData, 'app-file-trust.json');
afterAll(() => fs.rmSync(userData, { recursive: true, force: true }));

describe('app file trust (this computer)', () => {
  it('trusts and untrusts apps, and keeps the list in a file', async () => {
    const trust = await import('../electron/main/appFileTrust');
    expect(trust.isAppTrusted('app-1')).toBe(false);
    trust.setAppTrusted('app-1', true);
    trust.setAppTrusted('app-2', true);
    expect(trust.isAppTrusted('app-1')).toBe(true);
    expect(JSON.parse(fs.readFileSync(store(), 'utf8'))).toEqual({ trusted: ['app-1', 'app-2'] });
    trust.setAppTrusted('app-1', false);
    expect(trust.isAppTrusted('app-1')).toBe(false);
    for (const bad of [undefined, null, 42, '']) trust.setAppTrusted(bad, true);
    expect(JSON.parse(fs.readFileSync(store(), 'utf8'))).toEqual({ trusted: ['app-2'] });
  });

  it('remembers picked files by their real path (a link to one counts)', async () => {
    const trust = await import('../electron/main/appFileTrust');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-picked-'));
    const file = path.join(dir, 'scan.pdf');
    fs.writeFileSync(file, '%PDF-1.4');
    fs.symlinkSync(file, path.join(dir, 'link.pdf'));
    trust.recordPickedFile(path.join(dir, 'link.pdf'));
    expect(trust.wasPicked(fs.realpathSync(file))).toBe(true);
    expect(trust.wasPicked(path.join(dir, 'other.pdf'))).toBe(false);
    trust.recordPickedFile(path.join(dir, 'gone.pdf')); // missing: ignored, no throw
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

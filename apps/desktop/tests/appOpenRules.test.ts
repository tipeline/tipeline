import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { checkOpenFile, checkOpenUrl, isProgram, readableAppFile, resolveAppPath } from '../electron/main/utils/appOpen';

const HOME = '/Users/ana';
const file = { isFile: true, isDirectory: false };
const folder = { isFile: false, isDirectory: true };
const stat = (map: Record<string, any>) => (p: string) => map[p] ?? null;

describe('app open rules', () => {
  it('links: only web and mail', () => {
    expect(checkOpenUrl('https://example.com/a?b=1')).toBeNull();
    expect(checkOpenUrl('mailto:ana@example.com')).toBeNull();
    for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'smb://server/share', 'ftp://x', '', 'https://', 42])
      expect(checkOpenUrl(bad)).toBe('badUrl');
  });

  it('paths: ~ and relative ones (to ~/Tipeline) become absolute', () => {
    expect(resolveAppPath('~/Tipeline/output/a.pdf', HOME)).toBe('/Users/ana/Tipeline/output/a.pdf');
    expect(resolveAppPath('output/a.pdf', HOME)).toBe('/Users/ana/Tipeline/output/a.pdf');
    expect(resolveAppPath('/tmp/../tmp/x.png', HOME)).toBe('/tmp/x.png');
  });

  it('open: files inside ~/Tipeline only, and never programs or executables', () => {
    const inside = '/Users/ana/Tipeline/output/report.pdf';
    expect(checkOpenFile(inside, 'open', HOME, stat({ [inside]: file }))).toBeNull();
    expect(checkOpenFile('/Users/ana/Downloads/report.pdf', 'open', HOME, stat({ '/Users/ana/Downloads/report.pdf': file }))).toBe('outsideTipeline');
    expect(checkOpenFile('/Users/ana/TipelineEvil/x.pdf', 'open', HOME, stat({ '/Users/ana/TipelineEvil/x.pdf': file }))).toBe('outsideTipeline');
    for (const name of ['run.command', 'x.sh', 'Setup.app', 'tool.EXE', 'a.scpt', 'go.ps1'])
      expect(checkOpenFile(`/Users/ana/Tipeline/${name}`, 'open', HOME, stat({ [`/Users/ana/Tipeline/${name}`]: file }))).toBe('program');
    const script = '/Users/ana/Tipeline/output/do-it';
    expect(checkOpenFile(script, 'open', HOME, stat({ [script]: { ...file, executable: true } }))).toBe('program');
    expect(isProgram('photo.png')).toBe(false);
    // A program anywhere is named as one (not as "outside ~/Tipeline").
    const calc = '/System/Applications/Calculator.app';
    expect(checkOpenFile(calc, 'open', HOME, stat({ [calc]: folder }))).toBe('program');
  });

  it('open outside ~/Tipeline for a trusted app or a picked file — but never a program', () => {
    const doc = '/Users/ana/Downloads/report.pdf';
    expect(checkOpenFile(doc, 'open', HOME, stat({ [doc]: file }), true)).toBeNull();
    const tool = '/Users/ana/Downloads/setup.command';
    expect(checkOpenFile(tool, 'open', HOME, stat({ [tool]: file }), true)).toBe('program');
    const script = '/Users/ana/Downloads/run';
    expect(checkOpenFile(script, 'open', HOME, stat({ [script]: { ...file, executable: true } }), true)).toBe('program');
  });

  it('reveal and save run nothing: any existing file (reveal: folders too)', () => {
    const outside = '/Users/ana/Downloads/setup.command';
    expect(checkOpenFile(outside, 'reveal', HOME, stat({ [outside]: file }))).toBeNull();
    expect(checkOpenFile(outside, 'save', HOME, stat({ [outside]: file }))).toBeNull();
    expect(checkOpenFile('/Users/ana/Tipeline', 'reveal', HOME, stat({ '/Users/ana/Tipeline': folder }))).toBeNull();
    expect(checkOpenFile('/Users/ana/Tipeline', 'save', HOME, stat({ '/Users/ana/Tipeline': folder }))).toBe('notAFile');
    expect(checkOpenFile('/nope', 'reveal', HOME, stat({}))).toBe('notFound');
  });
});

describe('readableAppFile (a PDF viewer reading a workflow\'s file)', () => {
  // A real folder standing in for the home directory.
  const home = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'tipeline-home-'));
  const out = nodePath.join(home, 'Tipeline', 'output');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(nodePath.join(out, 'invoice.pdf'), '%PDF-1.4');
  fs.writeFileSync(nodePath.join(home, 'secret.pdf'), '%PDF-1.4');
  fs.symlinkSync(nodePath.join(home, 'secret.pdf'), nodePath.join(out, 'sneaky.pdf'));
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }));
  const real = (p: string) => fs.realpathSync(p);

  it('reads files inside ~/Tipeline — absolute, ~/ and relative paths', () => {
    const expected = { ok: true, file: real(nodePath.join(out, 'invoice.pdf')) };
    expect(readableAppFile(nodePath.join(out, 'invoice.pdf'), home, 1000)).toEqual(expected);
    expect(readableAppFile('~/Tipeline/output/invoice.pdf', home, 1000)).toEqual(expected);
    expect(readableAppFile('output/invoice.pdf', home, 1000)).toEqual(expected);
  });

  it('refuses files outside, links pointing outside, folders, missing files and big ones', () => {
    const outside = { ok: false, error: 'outsideTipeline' };
    expect(readableAppFile(nodePath.join(home, 'secret.pdf'), home, 1000)).toEqual(outside);
    expect(readableAppFile('output/sneaky.pdf', home, 1000)).toEqual(outside);
    expect(readableAppFile('output/../../secret.pdf', home, 1000)).toEqual(outside);
    expect(readableAppFile('output', home, 1000)).toEqual({ ok: false, error: 'notFound' });
    expect(readableAppFile('output/nope.pdf', home, 1000)).toEqual({ ok: false, error: 'notFound' });
    expect(readableAppFile('output/invoice.pdf', home, 3)).toEqual({ ok: false, error: 'tooLarge' });
    expect(readableAppFile('', home, 1000)).toEqual({ ok: false, error: 'notFound' });
  });

  it('outside ~/Tipeline when the app is trusted, or for exactly the file the user picked', () => {
    const secret = real(nodePath.join(home, 'secret.pdf'));
    expect(readableAppFile(secret, home, 1000, () => true)).toEqual({ ok: true, file: secret });
    // "picked": the check gets the real path, so a link to the picked file counts too
    const picked = (p: string) => p === secret;
    expect(readableAppFile('output/sneaky.pdf', home, 1000, picked)).toEqual({ ok: true, file: secret });
    fs.writeFileSync(nodePath.join(home, 'other.pdf'), '%PDF-1.4');
    expect(readableAppFile(nodePath.join(home, 'other.pdf'), home, 1000, picked)).toEqual({ ok: false, error: 'outsideTipeline' });
  });
});

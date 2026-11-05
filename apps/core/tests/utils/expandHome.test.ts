import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandHomeInParams, expandHomePath, expandsHomePaths } from '@utils/expandHome';
import { Action } from '@action/Action';

const home = '/Users/someone';

describe('expandHomePath', () => {
  it('expands ~ and ~/ to the home folder', () => {
    expect(expandHomePath('~', home)).toBe(home);
    expect(expandHomePath('~/Documents/helloworld.txt', home)).toBe('/Users/someone/Documents/helloworld.txt');
  });

  it('leaves everything else alone', () => {
    expect(expandHomePath('/tmp/x.txt', home)).toBe('/tmp/x.txt');
    expect(expandHomePath('notes/~/x', home)).toBe('notes/~/x');
    expect(expandHomePath('~user/x', home)).toBe('~user/x');
    expect(expandHomePath('', home)).toBe('');
  });
});

describe('expandHomeInParams', () => {
  it('looks inside plain objects and arrays', () => {
    expect(
      expandHomeInParams(
        { src: '~/a.txt', connection: { filename: '~/db.sqlite' }, attachments: [{ path: '~/f.pdf' }], count: 2 },
        home
      )
    ).toEqual({
      src: '/Users/someone/a.txt',
      connection: { filename: '/Users/someone/db.sqlite' },
      attachments: [{ path: '/Users/someone/f.pdf' }],
      count: 2,
    });
  });

  it('keeps live values such as connections untouched', () => {
    class Connection {
      filename = '~/x';
    }
    const live = new Connection();
    expect(expandHomeInParams({ connection: live }, home).connection).toBe(live);
  });
});

describe('expandsHomePaths', () => {
  it('applies to built-in steps that use local files', () => {
    expect(expandsHomePaths('file', 'write')).toBe(true);
    expect(expandsHomePaths('pdf', 'merge')).toBe(true);
  });

  it('skips remote paths, text steps and plugins', () => {
    expect(expandsHomePaths('ssh', 'exec')).toBe(false);
    expect(expandsHomePaths('string', 'toUpperCase')).toBe(false);
    expect(expandsHomePaths('system', 'message')).toBe(false);
    expect(expandsHomePaths('file', 'write', 'plugin')).toBe(false);
  });
});

describe('a file.write step with a ~ path', () => {
  const originalHome = process.env.HOME;
  let tmpHome = '';

  afterEach(() => {
    process.env.HOME = originalHome;
    if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('writes under the home folder, not into a folder named ~', async () => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-home-'));
    process.env.HOME = tmpHome;
    const action = new Action({
      identifier: 'w1',
      group: 'file',
      name: 'write',
      params: { src: '~/Documents/helloworld.txt', data: 'HELLO WORLD' },
    } as any);

    await action.execute({} as any, undefined);

    expect(fs.readFileSync(path.join(tmpHome, 'Documents', 'helloworld.txt'), 'utf8')).toBe('HELLO WORLD');
    expect(fs.existsSync(path.join(process.cwd(), '~'))).toBe(false);
    expect(action.getParams().src).toBe(path.join(tmpHome, 'Documents', 'helloworld.txt'));
  });
});

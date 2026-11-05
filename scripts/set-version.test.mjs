import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { findMismatches, setVersion } from './set-version.mjs';

let root;

function write(relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(content, null, 2) + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'set-version-'));
  write('package.json', { name: 'root', workspaces: ['apps/*', 'packages/*'] });
  write('apps/core/package.json', {
    name: '@tipeline/core',
    version: '0.0.0',
    dependencies: { '@tipeline/utils': '0.0.0', chalk: '^5.0.0' },
  });
  write('packages/utils/package.json', { name: '@tipeline/utils', version: '0.0.0' });
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('sets workspaces and internal dependencies, leaves other dependencies alone', () => {
  assert.equal(setVersion(root, '0.2.0'), 2);
  const core = JSON.parse(fs.readFileSync(path.join(root, 'apps/core/package.json'), 'utf-8'));
  assert.equal(core.version, '0.2.0');
  assert.deepEqual(core.dependencies, { '@tipeline/utils': '0.2.0', chalk: '^5.0.0' });
  assert.deepEqual(findMismatches(root, '0.2.0'), []);
});

test('rejects what is not a version', () => {
  assert.throws(() => setVersion(root, 'v0.2'), /not a version/);
});

test('reports a workspace and a dependency that drifted', () => {
  write('packages/utils/package.json', { name: '@tipeline/utils', version: '0.1.0' });
  assert.deepEqual(findMismatches(root, '0.1.0'), [
    '@tipeline/core is 0.0.0, expected 0.1.0',
    '@tipeline/core needs @tipeline/utils@0.0.0, expected 0.1.0',
  ]);
});

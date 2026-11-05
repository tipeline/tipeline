import assert from 'node:assert/strict';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { mergeUpdateFiles } from './merge-mac-update-files.mjs';

const manifest = (version, arch) =>
  `version: ${version}\nfiles:\n  - url: Tipeline-${arch}.zip\n    sha512: ${arch}sha\npath: Tipeline-${arch}.zip\nsha512: ${arch}sha\n`;

test('lists the downloads of both architectures', () => {
  const merged = yaml.load(mergeUpdateFiles([manifest('0.2.0', 'arm64'), manifest('0.2.0', 'x64')]));
  assert.equal(merged.version, '0.2.0');
  assert.deepEqual(merged.files.map((file) => file.url), ['Tipeline-arm64.zip', 'Tipeline-x64.zip']);
});

test('refuses builds of different versions', () => {
  assert.throws(() => mergeUpdateFiles([manifest('0.2.0', 'arm64'), manifest('0.3.0', 'x64')]), /different versions/);
});

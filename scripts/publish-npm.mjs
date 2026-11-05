#!/usr/bin/env node
// Publishes the npm packages by name, dependencies first. Run after set-version and a build.
//
//   node scripts/publish-npm.mjs             publish
//   node scripts/publish-npm.mjs --dry-run   show what would be published
//
// A version that's already on npm is skipped, so a publish that failed halfway can be rerun.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISH_ORDER = [
  'packages/types',
  'packages/utils',
  'packages/i18n',
  'packages/schemas',
  'packages/agent',
  'apps/core',
  'apps/cli',
  'apps/server',
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

function alreadyPublished(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { cwd: root, encoding: 'utf-8' });
  return result.status === 0 && result.stdout.trim() === version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const workspace of PUBLISH_ORDER) {
    const { name, version } = JSON.parse(fs.readFileSync(path.join(root, workspace, 'package.json'), 'utf-8'));
    if (alreadyPublished(name, version)) {
      console.log(`${name}@${version} is already on npm, skipping.`);
      continue;
    }
    console.log(`${dryRun ? 'Would publish' : 'Publishing'} ${name}@${version}`);
    execFileSync('npm', ['publish', '-w', workspace, ...(dryRun ? ['--dry-run'] : [])], { cwd: root, stdio: 'inherit' });
  }
}

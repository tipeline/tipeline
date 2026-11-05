#!/usr/bin/env node
// Keeps every workspace on one version, including the exact @tipeline/* versions they depend on.
//
//   node scripts/set-version.mjs 0.2.0     set the version and update package-lock.json
//   node scripts/set-version.mjs --check   fail if the workspaces don't all match
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function workspaceManifests(root) {
  const { workspaces } = readJson(path.join(root, 'package.json'));
  return workspaces.flatMap((pattern) => {
    const parent = path.join(root, pattern.replace(/\/\*$/, ''));
    return fs
      .readdirSync(parent)
      .map((name) => path.join(parent, name, 'package.json'))
      .filter((file) => fs.existsSync(file));
  });
}

/** Everything that isn't on `version`, as readable lines. Empty means they all match. */
export function findMismatches(root, version) {
  const manifests = workspaceManifests(root).map((file) => ({ file, pkg: readJson(file) }));
  const names = new Set(manifests.map(({ pkg }) => pkg.name));
  const expected = version ?? manifests[0].pkg.version;
  const mismatches = [];
  for (const { pkg } of manifests) {
    if (pkg.version !== expected) mismatches.push(`${pkg.name} is ${pkg.version}, expected ${expected}`);
    for (const field of DEPENDENCY_FIELDS) {
      for (const [dep, range] of Object.entries(pkg[field] ?? {})) {
        if (names.has(dep) && range !== expected) {
          mismatches.push(`${pkg.name} needs ${dep}@${range}, expected ${expected}`);
        }
      }
    }
  }
  return mismatches;
}

/** Rewrites the manifests only, keeping their formatting. Returns how many changed. */
export function setVersion(root, version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version like 1.2.3`);
  const manifests = workspaceManifests(root);
  const names = new Set(manifests.map((file) => readJson(file).name));
  let changed = 0;
  for (const file of manifests) {
    const before = fs.readFileSync(file, 'utf-8');
    const pkg = JSON.parse(before);
    pkg.version = version;
    for (const field of DEPENDENCY_FIELDS) {
      for (const dep of Object.keys(pkg[field] ?? {})) {
        if (names.has(dep)) pkg[field][dep] = version;
      }
    }
    const after = JSON.stringify(pkg, null, 2) + (before.endsWith('\n') ? '\n' : '');
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed += 1;
    }
  }
  return changed;
}

function main(args) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (args[0] === '--check') {
    const mismatches = findMismatches(root, args[1]);
    if (mismatches.length) {
      console.error(`Versions don't match:\n  ${mismatches.join('\n  ')}`);
      process.exit(1);
    }
    console.log('All workspaces are on the same version.');
    return;
  }
  if (args.length !== 1) {
    console.error('Usage: node scripts/set-version.mjs <version> | --check [version]');
    process.exit(1);
  }
  const changed = setVersion(root, args[0]);
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { cwd: root, stdio: 'inherit' });
  console.log(`Set ${args[0]} in ${changed} package.json files and package-lock.json.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

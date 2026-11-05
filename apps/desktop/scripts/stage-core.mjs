// Stages apps/core into apps/desktop/resources/core for electron-builder to
// ship via extraResources: the compiled dist/ output copied as-is (it's
// already self-contained — tsc-alias resolves every @/, @engine/, etc. path
// alias to a relative one) plus a flattened, production-only node_modules.
//
// We deliberately do NOT bundle core into a single file (e.g. via esbuild).
// Bree, core's default job runner, spawns each task as a real worker_thread
// pointed at dist/engine/worker/TaskWorker.js on disk (see BreeRunner.ts),
// and several core files derive __dirname from import.meta.url for relative
// path resolution — both assume core's original multi-file dist/ layout
// stays intact, which single-file bundling breaks.
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const REPO_NODE_MODULES = path.join(REPO_ROOT, 'node_modules');
const CORE_DIR = path.join(REPO_ROOT, 'apps/core');
const CORE_DIST = path.join(CORE_DIR, 'dist');
const OUT_DIR = path.join(__dirname, '..', 'resources', 'core');

const { version: CORE_VERSION } = JSON.parse(
  fs.readFileSync(path.join(CORE_DIR, 'package.json'), 'utf-8')
);

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

fs.cpSync(CORE_DIST, path.join(OUT_DIR, 'dist'), { recursive: true });

// npm workspaces hoists nearly everything to the repo-root node_modules —
// apps/core/node_modules itself only holds devDependencies. Ask npm for the
// exact resolved set of production dependency directories (including
// transitive deps, and any nested node_modules npm couldn't hoist due to a
// version conflict) rather than re-deriving that resolution ourselves.
// `npm ls` exits non-zero — and execSync throws — whenever any peer
// dependency is unmet, even an optional one it's fine to ignore (e.g.
// @puppeteer/browsers declares an optional peer on proxy-agent@>=8, while
// the tree hoists proxy-agent@6 for an older puppeteer-core release
// elsewhere). The dependency list itself is still printed to stdout
// correctly regardless, so fall back to the thrown error's stdout.
let lsOutput;
try {
  lsOutput = execSync('npm ls --omit=dev --all --parseable -w apps/core', {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
} catch (err) {
  if (!err.stdout) throw err;
  lsOutput = err.stdout;
}

const depPaths = lsOutput
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith(REPO_NODE_MODULES + path.sep))
  // Excludes the @tipeline/core workspace self-symlink — Server.js is run
  // directly by path, nothing requires the package as "@tipeline/core".
  .filter((line) => line !== path.join(REPO_NODE_MODULES, '@tipeline/core'));

// Some packages (e.g. puppeteer-extra-plugin-user-preferences) ship a
// symlink that points back at an ancestor of itself. Harmless left alone,
// but both cpSync's dereference and electron-builder's own extraResources
// copy step will walk straight into the cycle — so these need to be
// dropped, not just left non-dereferenced.
function isSelfReferentialSymlink(src) {
  const st = fs.lstatSync(src);
  if (!st.isSymbolicLink()) return false;
  const target = fs.realpathSync(src);
  return src === target || src.startsWith(target + path.sep);
}

let copied = 0;
for (const depPath of depPaths) {
  const rel = path.relative(REPO_NODE_MODULES, depPath);
  const dest = path.join(OUT_DIR, 'node_modules', rel);
  // Dereference every symlink (workspace packages like @tipeline/schemas,
  // npm's node_modules/.bin shims, etc.) — codesign's --strict verification
  // rejects any symlink inside a signed bundle whose target resolves
  // outside the bundle, and it's simpler to have none at all than to reason
  // about which ones are bundle-relative-safe.
  fs.cpSync(depPath, dest, {
    recursive: true,
    dereference: true,
    filter: (src) => !isSelfReferentialSymlink(src),
  });
  copied++;
}

// macOS treats any directory named "*.app" as an application bundle and
// tries to codesign it as one — which breaks for packages that happen to
// name an internal folder that way for unrelated reasons (e.g.
// puppeteer-extra-plugin-stealth's "chrome.app" evasion, named after the
// browser API it spoofs, not a macOS app). Rename any such directories and
// patch the one known reference to the old name.
function findAppDirs(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.endsWith('.app')) results.push(full);
    else findAppDirs(full, results);
  }
  return results;
}

for (const dir of findAppDirs(path.join(OUT_DIR, 'node_modules'))) {
  const renamed = dir.replace(/\.app$/, '_app');
  fs.renameSync(dir, renamed);
  console.log(`[stage-core] renamed ${path.relative(OUT_DIR, dir)} -> ${path.relative(OUT_DIR, renamed)}`);
}

const stealthIndex = path.join(OUT_DIR, 'node_modules/puppeteer-extra-plugin-stealth/index.js');
if (fs.existsSync(stealthIndex)) {
  fs.writeFileSync(stealthIndex, fs.readFileSync(stealthIndex, 'utf-8').replace(/'chrome\.app'/, "'chrome_app'"));
}

// dist/engine/Server.js is compiled ESM ("type": "module" in apps/core's own
// package.json). A packaged app has no ancestor package.json above
// Resources/core to inherit that from, so this must be explicit. `version`
// is carried over too — utils/coreVersion.ts reads it (via require('../../package.json'))
// to report its own version over IPC/status.
fs.writeFileSync(
  path.join(OUT_DIR, 'package.json'),
  JSON.stringify({ type: 'module', version: CORE_VERSION }, null, 2)
);

// Packaged Core runs on Electron's own Node (see CoreLauncher.ts), whose native module version
// differs from the plain Node that built the repo's node_modules. better-sqlite3 is the one
// native module Core can't start without: sharp and canvas use Node-API, which works on both,
// and ssh2, cpu-features and msgpackr-extract fall back to JavaScript. Only the staged copy
// changes, so the CLI and `test-desktop` keep working on plain Node. It builds for this machine
// only, so each platform and architecture has to be released from its own build machine.
const electronRequire = createRequire(path.join(__dirname, '..', 'package.json'));
const ELECTRON_PATH = electronRequire('electron');
const { version: ELECTRON_VERSION } = electronRequire('electron/package.json');
const STAGED_MODULES = path.join(OUT_DIR, 'node_modules');
const SQLITE_DIR = path.join(STAGED_MODULES, 'better-sqlite3');
const ELECTRON_TARGET = [
  '--runtime=electron',
  `--target=${ELECTRON_VERSION}`,
  `--arch=${process.arch}`,
];

fs.rmSync(path.join(SQLITE_DIR, 'build'), { recursive: true, force: true });
try {
  execFileSync(
    process.execPath,
    [path.join(STAGED_MODULES, 'prebuild-install/bin.js'), ...ELECTRON_TARGET],
    { cwd: SQLITE_DIR, stdio: 'inherit' }
  );
} catch {
  console.log('[stage-core] no prebuilt better-sqlite3 for this Electron, compiling it');
  execFileSync(
    process.execPath,
    [
      electronRequire.resolve('node-gyp/bin/node-gyp.js'),
      'rebuild',
      '--release',
      ...ELECTRON_TARGET,
      '--dist-url=https://electronjs.org/headers',
    ],
    { cwd: SQLITE_DIR, stdio: 'inherit' }
  );
}

// A broken binary only shows up as a Core that dies on the user's machine, so stop the build here.
execFileSync(ELECTRON_PATH, ['-e', "new (require('./lib'))(':memory:').close()"], {
  cwd: SQLITE_DIR,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
console.log(`[stage-core] better-sqlite3 loads in Electron ${ELECTRON_VERSION} (${process.arch})`);

console.log(`[stage-core] wrote ${OUT_DIR} (${copied} dependency directories)`);

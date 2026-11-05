# Releasing Tipeline

Everything ships on one version: Desktop 0.4.0 contains Core 0.4.0, and CLI 0.4.0 installs Core 0.4.0.

## Make a release

1. Merge `dev` into `main`, and work from `main`.
2. Set the version: `npm run version:set -- 0.4.0`, then commit it, tag it `v0.4.0`, and push both. The workflow refuses a commit that isn't tagged with its own version.
3. Publish it, one of two ways:
   - **GitHub Actions:** run the **Release** workflow from the Actions tab. It tests, builds both Mac installers and creates a draft release. Tick **Also publish the packages to npm** if this release includes them.
   - **By hand:** `npm run build`, then `npm run publish:npm` (add `-- --dry-run` to see what would go out), then `npm -w apps/desktop run build` on each kind of Mac. Installers land in `apps/desktop/release/<version>/`.
4. Check the draft on GitHub, and publish it.
5. Merge `main` back into `dev`, so `dev` has the version commit.

Use a regular merge for `dev` into `main`, not a squash, or the two branches stop sharing history and the next merge conflicts.

A publish that fails halfway can be rerun: versions already on npm are skipped.

## Fix a released version

1. Branch `hotfix/…` from `main`, and merge it into `main` with a pull request.
2. Release it as above, starting at step 2.
3. Merge `main` back into `dev` straight away, or the next release can bring the bug back.

The very first npm publish has to be by hand, since trusted publishing can only be set up on packages that exist. After that, add the Release workflow as a trusted publisher on npmjs.com for each package.

## Before users can install it: signing

Mac builds are unsigned until there's an Apple Developer ID, so macOS warns people who open them. Then:

1. Add the certificate and notarization secrets listed in `.github/workflows/release.yml`, and uncomment them there.
2. Set `"notarize": true` in `apps/desktop/electron-builder.json5`.
3. Set `AUTO_UPDATE_ENABLED` to `true` in `apps/desktop/electron/main/utils/AppUpdater.ts`.
4. Ship a signed release, then a second one, and check that the first updates itself. People on an unsigned build have to reinstall by hand once.

## Database migrations

CLI and Desktop share one Core and one database, and either may be older than the other. A Core refuses a database that has migrations newer than its own, and users then have to update whichever install is behind.

- Prefer additive migrations: new tables and new nullable columns.
- Don't rewrite old migrations, and always name new ones with a later timestamp than the newest one.

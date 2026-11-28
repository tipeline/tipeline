# @tipeline/cli

Run and manage [Tipeline](https://github.com/tipeline/tipeline) workflows from the terminal. This package includes the Tipeline engine.

## Install

Requires Node 24 or later.

```bash
npm i -g @tipeline/cli --allow-scripts=better-sqlite3
tipeline start
tipeline workflow run my-workflow.yml
```

`--allow-scripts=better-sqlite3` sets up the SQLite module during the install. Without it,
`tipeline start` sets it up on first run, which needs internet access then.

Run `tipeline --help` to see all commands.

## Run on a server

- **Your own user:** `tipeline service install` starts Core now, after a crash, and after a
  reboot. On Linux it turns on linger so Core keeps running after you log out, or prints the
  `sudo loginctl enable-linger` line when that needs an administrator.
- **systemd system service or Docker:** use `tipeline start --foreground` as the command. Core
  stays attached, logs to stdout, and stops cleanly on SIGTERM.

The full guide, with a unit file and a Dockerfile, is at
https://github.com/tipeline/tipeline/blob/main/apps/docs/cli/server.md.

## Upgrade

Stop the engine first, so the new version is the one that runs:

```bash
tipeline stop
npm i -g @tipeline/cli@latest --allow-scripts=better-sqlite3
tipeline start
```

Licensed under Apache-2.0.

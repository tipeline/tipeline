# @tipeline/cli

Run and manage [Tipeline](https://github.com/tipeline/tipeline) workflows from the terminal. This package includes the Tipeline engine.

## Install

Requires Node 24 or later.

```bash
npm i -g @tipeline/cli
tipeline install
tipeline start
```

Run `tipeline --help` to see all commands.

## Upgrade

Stop the engine first, so the new version is the one that runs:

```bash
tipeline stop
npm i -g @tipeline/cli@latest
tipeline start
```

Licensed under Apache-2.0.

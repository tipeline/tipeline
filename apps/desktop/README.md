# Tipeline Desktop

The Electron + Vue 3 app for building and running Tipeline workflows and apps. It starts a
Core engine for you, or connects to one that is already running.

## Run it

Requires Node.js 24. From the repository root:

```bash
npm install
npm run build
npm -w apps/desktop run dev
```

This starts Vite (on port 5173, or the next free one) and opens the Electron window with hot
reload. The VS Code debugger uses `http://127.0.0.1:3344` instead.
`npm -w apps/desktop run build` type-checks the app and packages it with Electron Builder.

See the [developer setup guide](../docs/internals/setup.md) for the full details.

## Layout

| Path | What it is |
|---|---|
| `electron/main` | Main process: window management and the IPC bridge to Core |
| `electron/preload` | The APIs exposed to the renderer through `contextBridge` |
| `src` | The Vue renderer: pages, components, Pinia stores and routes |

This app started from [electron-vite-vue](https://github.com/electron-vite/electron-vite-vue).
See [LICENSE](LICENSE) for that template's MIT notice.

# Tipeline Mobile

The phone app for a [Tipeline](https://github.com/tipeline/tipeline) Server: sign in, list workflows, run one with its inputs and follow it live, or ask the Assistant in your own words. It is a client only: workflows run on the Server's Core, never on the phone.

Built with Vue 3, [Ionic](https://ionicframework.com/docs/vue/overview) (tabs, navigation, iOS and Android styling) and [Capacitor](https://capacitorjs.com/) (the native shell). It talks to the Server through [`@tipeline/client`](../../packages/client).

## Run it in a browser

You need a Tipeline Server that allows this app's development address. The Docker stack in `apps/server/resources` works:

```bash
# From the repo root: a Server on port 4011 that accepts http://localhost:5180
TIPELINE_SERVER_HOST_PORT=4011 TIPELINE_CORS_ORIGINS=http://localhost:5180 \
  docker compose -f apps/server/resources/docker-compose.yml -p tipeline-dev up -d --build

npm -w apps/mobile run dev     # http://localhost:5180
```

Sign in with server `http://127.0.0.1:4011` and the stack's admin account (`admin@example.com` / `changeme` unless you set `TIPELINE_ADMIN_EMAIL` / `TIPELINE_ADMIN_PASSWORD`).

The dev server always uses port 5180 because the Server only answers browsers from origins it lists.

The tabs follow the designs: **Home** (today's runs and failures, what is waiting for you, starred workflows, the next scheduled run), **Workflows**, **Assistant**, **Apps** and **Inbox** (approvals, alerts, workflows whose latest run failed, missed scheduled runs). **More** opens from the avatar on Home: the account, **Runs** (each run's steps, result and Cancel) and **Schedules** (admins add, pause and delete them in plain words). Stars and dismissed Inbox items are kept on the phone, per server.

The **Assistant** tab (editors and admins) needs an LLM key on the Server: connect Desktop to it as an admin and set one in Settings → Assistant.

## Apps on the phone

The **Apps** tab runs the apps built in Desktop with Desktop's own app runtime and components, unchanged, straight from `apps/desktop/src`:

- **Imports.** `vite.config.ts` resolves `@desktop/...` to Desktop's source. Inside those files `@/` means Desktop's `src`; everywhere else it means the phone's.
- **Bridge.** Desktop's code talks to Core through `window.ipcRenderer`. On the phone that is `src/apps/desktopBridge.ts`, built on `@tipeline/client`:
  - requests and runs go to the Server;
  - run events arrive on the same channels Desktop's main process uses;
  - web links open in the phone's browser;
  - opening files on the server machine or file dialogs answer with a message, since a phone can't reach them.
- **Layout.** Desktop's two app grids are swapped at build time for `src/apps/PhoneGrid.vue`: one column in reading order, with small components (KPIs, buttons) paired two to a row. Wide components such as tables and the kanban board scroll sideways for now.
- **Styles.** `src/styles/app-area.css` brings Tailwind and Desktop's design tokens (`apps/desktop/src/assets/css/theme.css`, shared with Desktop). Tailwind's reset applies only while an app is open (`body.tl-apps`, see `app-preflight.css`). Ionic's global CSS sits in the lowest cascade layer (`src/styles/ionic.css`), so it doesn't override Desktop's styles.
- **Loading.** All of it loads the first time an app opens. The rest of the phone app doesn't carry Desktop's code.

`app-preflight.css` is generated from Tailwind's `preflight.css`. Regenerate it when Tailwind's major version changes.



```bash
npm -w apps/mobile run dev      # dev server on :5180
npm -w apps/mobile run build    # type check + production build into dist/
npm -w apps/mobile run test     # unit tests (Vitest)
```

## Not yet

- **Native projects.** `ios/` and `android/` aren't generated yet (`npx cap add ios`, `npx cap add android`); they need Xcode and Android Studio.
- **Secure token storage.** The sign-in is kept in `localStorage` for now; the native build must keep it in the Keychain / Keystore (see `src/storage.ts`).
- **Assistant:** writing new workflows (drafts) and turning a request into a schedule are Desktop-only for now.
- **Approvals:** no Face ID / fingerprint check before deciding yet (it needs the native projects).
- **Apps:** tables as cards, phone versions of kanban, calendar, map and gallery, and the optional `mobile:` settings in app YAML (see the plan). Pictures and files stored on the server machine don't show.
- **Push notifications:** the Server sends them when set up (see the Server docs, "Push notifications"); the phone registers once the native projects exist.

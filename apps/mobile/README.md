# Tipeline Mobile

The phone app for a [Tipeline](https://github.com/tipeline/tipeline) Server: sign in, list workflows, run one with its inputs and follow it live. It is a client only: workflows run on the Server's Core, never on the phone.

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

## Commands

```bash
npm -w apps/mobile run dev      # dev server on :5180
npm -w apps/mobile run build    # type check + production build into dist/
npm -w apps/mobile run test     # unit tests (Vitest)
```

## Not yet

- **Native projects.** `ios/` and `android/` aren't generated yet (`npx cap add ios`, `npx cap add android`); they need Xcode and Android Studio.
- **Secure token storage.** The sign-in is kept in `localStorage` for now; the native build must keep it in the Keychain / Keystore (see `src/storage.ts`).
- Runs, Inbox, Schedules, apps, push notifications and the Assistant: see the plan.

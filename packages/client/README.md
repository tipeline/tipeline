# @tipeline/client

Browser client for a [Tipeline](https://github.com/tipeline/tipeline) Server: sign in over HTTP, then send commands and follow runs over one WebSocket. It uses only the standard `fetch` and `WebSocket`, so it runs in a browser, a phone's WebView (the mobile app) and Node 24.

```ts
import { login, TipelineClient } from '@tipeline/client';

const result = await login('https://tipeline.acme.dev', 'me@acme.dev', 'password');
if (result.status !== 'ok') throw new Error('MFA: call loginMfa() with result.challengeId');

const client = new TipelineClient({ url: 'wss://tipeline.acme.dev', token: result.token });
client.connect();

const workflows = await client.request('taskList');

const run = client.run('exec', { identifier: 'nightly-etl', variables: { env: 'prod' } }, (event) => {
  console.log(event.type, event.data); // start, action, action_error, end, paused…
});
const last = await run.done; // end_all or error
```

Commands and their answers are the Server's WebSocket protocol: see the Server API reference. Requests sent while offline wait and go out on reconnect. A token the Server refuses stops the client (`status` becomes `unauthorized`) instead of retrying.

Part of [Tipeline](https://github.com/tipeline/tipeline). Licensed under Apache-2.0.

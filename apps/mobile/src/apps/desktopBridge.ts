import type { ServerMessage, TipelineClient } from '@tipeline/client';

type Listener = (event: unknown, message: any) => void;

/** What Desktop's renderer gets from its main process as `window.ipcRenderer`. */
export interface DesktopBridge {
  invoke(channel: string, request?: { correlationId?: string; payload?: unknown } | Record<string, unknown>): Promise<any>;
  send(channel: string, request: { correlationId: string; payload?: unknown }): void;
  on(channel: string, listener: Listener): void;
  off(channel: string, listener?: Listener): void;
}

/** Commands that start a run: their events come back on `stream:<correlationId>`. */
const RUN_COMMANDS = new Set(['appRun', 'exec', 'pipelineResume']);

/** The Server's run events, by the type Desktop's main process gives them. */
const RUN_EVENT_TYPES: Record<string, string> = {
  onTaskStart: 'start',
  onAction: 'action',
  onActionError: 'action_error',
  onTaskEnd: 'end',
  onTaskError: 'error',
  onTaskEndAll: 'end_all',
  onDebugPaused: 'paused',
};

/**
 * Desktop main-process features about files on the computer Desktop runs on. A phone can't
 * reach the server machine's files, so they answer the way Desktop's main process answers a
 * file it may not use: `{ ok: false, error: 'desktopOnly' }`, which the widgets already show
 * ("Files can only be shown in the desktop app").
 */
const FILE_FEATURES = new Set(['app:read-file', 'app:media-check', 'app:open-file', 'shell:show-item-in-folder']);

export interface BridgeOptions {
  /** Opens a web address outside the app (the phone's browser). */
  openUrl(url: string): void;
  /** Tells the person something can't be done here (a file picker on the desktop computer). */
  notify(message: string): void;
  /** The message for a feature that needs the computer the Server runs on. */
  computerOnly: string;
}

/**
 * Desktop's app runtime and widgets talk to Core through `window.ipcRenderer`, which on
 * Desktop is Electron's bridge to its main process. On the phone the same calls go to the
 * Server through @tipeline/client, so Desktop's app code runs unchanged:
 *
 *  - `invoke(command, { payload })`  → a request; Desktop's channel names are the commands.
 *  - `send(run, { correlationId, payload })` → a run under that correlationId; its events go
 *    to `stream:<correlationId>` and `stream:broadcast`, as Desktop's main process sends them.
 *  - Runs the Server tells everyone about (resumed approvals, schedules) go to `stream:broadcast`.
 *  - The few main-process features about the desktop computer itself answer as Desktop does
 *    for a file it can't use; its file dialogs say why and pick nothing. Opening a web link
 *    opens the phone's browser.
 */
export function createDesktopBridge(client: () => TipelineClient, options: BridgeOptions): DesktopBridge & { dispose(): void } {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (channel: string, message: unknown) => {
    for (const listener of [...(listeners.get(channel) ?? [])]) listener(null, message);
  };
  const ownRuns = new Set<string>();

  const unsubscribe = client().subscribe((message: ServerMessage) => {
    const type = RUN_EVENT_TYPES[message.event];
    if (!type || !message.correlationId || ownRuns.has(message.correlationId)) return;
    emit('stream:broadcast', { type, ...message });
  });

  const payloadOf = (request: any) =>
    request && typeof request === 'object' && 'payload' in request ? request.payload : request;

  return {
    async invoke(channel, request) {
      const payload = payloadOf(request);
      if (channel === 'app:open-url') {
        const url = String((payload as any)?.url ?? '');
        if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return { ok: false, error: 'Only web and email links open from an app.' };
        options.openUrl(url);
        return { ok: true };
      }
      if (channel === 'app:fetch-url') {
        const response = await fetch(String((payload as any)?.url ?? ''));
        if (!response.ok) throw new Error(`The address answered ${response.status}`);
        return { bytes: new Uint8Array(await response.arrayBuffer()) };
      }
      if (channel === 'app:system-info') return { platform: 'mobile' };
      if (FILE_FEATURES.has(channel)) return { ok: false, error: 'desktopOnly' };
      if (channel === 'app:file-trust:get' || channel === 'app:file-trust:set') return false;
      if (channel.startsWith('dialog:')) {
        options.notify(options.computerOnly);
        return channel === 'dialog:save-file' ? { canceled: true } : null;
      }
      return client().request(channel, payload ?? {});
    },

    send(channel, request) {
      const { correlationId } = request;
      const payload = payloadOf(request);
      if (!RUN_COMMANDS.has(channel)) {
        void client()
          .request(channel, payload ?? {})
          .catch(() => {});
        return;
      }
      ownRuns.add(correlationId);
      const run = client().run(
        channel,
        payload,
        (event) => {
          const message = { ...event, correlationId };
          emit(`stream:${correlationId}`, message);
          emit('stream:broadcast', message);
        },
        { correlationId }
      );
      run.done.catch((error: Error) => {
        // A dropped connection never sends the run's own error: say it, so the page stops waiting.
        if (error && !(error as any).type) {
          const message = { type: 'error', correlationId, error: error.message };
          emit(`stream:${correlationId}`, message);
        }
      }).finally(() => setTimeout(() => ownRuns.delete(correlationId), 5000));
    },

    on(channel, listener) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    },

    off(channel, listener) {
      if (!listener) listeners.delete(channel);
      else listeners.get(channel)?.delete(listener);
    },

    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}

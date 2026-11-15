/**
 * The Server's WebSocket protocol, as Desktop already speaks it (MessageManager.ts).
 *
 * Send:    { event: 'taskList', correlationId, payload }
 * Answer:  { event: 'onTaskList', correlationId, data | error }
 *
 * A run (`exec`, `appRun`, `pipelineResume`, the debug commands) is answered with a stream of
 * events on the same correlationId instead of one answer.
 */

/** The subprotocol a browser asks for; the token goes as `bearer.<token>` next to it. */
export const WS_PROTOCOL = 'tipeline';

/** The Server closes the connection with this code when the token is missing or refused. */
export const UNAUTHORIZED_CLOSE_CODE = 4001;

/** Commands answered by a stream of run events rather than one answer. */
export const RUN_COMMANDS = new Set([
  'exec', 'appRun', 'pipelineResume',
  'debugNext', 'debugRun', 'debugPause', 'debugStop', 'debugCommand',
]);

export type RunEventType = 'start' | 'action' | 'action_error' | 'end' | 'error' | 'end_all' | 'paused';

/** Server event → run event type. The same names Desktop's renderer receives. */
export const RUN_EVENTS: Record<string, RunEventType> = {
  onTaskStart: 'start',
  onAction: 'action',
  onActionError: 'action_error',
  // A sub-workflow's end arrives mid-run, so 'end' does not finish the run.
  onTaskEnd: 'end',
  onTaskError: 'error',
  onTaskEndAll: 'end_all',
  onDebugPaused: 'paused',
};

/** Only these finish a run. */
export const FINAL_RUN_EVENTS = new Set<RunEventType>(['end_all', 'error']);

/** `taskList` → `onTaskList`. */
export function answerEventFor(command: string): string {
  return `on${command.charAt(0).toUpperCase()}${command.slice(1)}`;
}

/** `wss://host` → `https://host`, `ws://host` → `http://host`; anything else is kept. */
export function httpBaseFor(serverUrl: string): string {
  return serverUrl
    .trim()
    .replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'))
    .replace(/\/+$/, '');
}

/** `https://host` → `wss://host`, `http://host` → `ws://host`; anything else is kept. */
export function wsUrlFor(serverUrl: string): string {
  return serverUrl
    .trim()
    .replace(/^https?:\/\//, (m) => (m === 'https://' ? 'wss://' : 'ws://'))
    .replace(/\/+$/, '');
}

export function newCorrelationId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

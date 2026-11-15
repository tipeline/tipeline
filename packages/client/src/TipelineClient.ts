import {
  FINAL_RUN_EVENTS,
  RUN_COMMANDS,
  RUN_EVENTS,
  UNAUTHORIZED_CLOSE_CODE,
  WS_PROTOCOL,
  answerEventFor,
  newCorrelationId,
  wsUrlFor,
  type RunEventType,
} from './protocol.js';
import { ASSISTANT_FINAL_PHASES, type AssistantHandle, type AssistantRequestItem, type AssistantUpdate } from './assistant.js';

export type ConnectionStatus =
  /** Not started yet, or `close()` was called. */
  | 'idle'
  | 'connecting'
  | 'open'
  /** Lost the connection; trying again after a delay. */
  | 'reconnecting'
  /** The Server refused the token. The client stops; sign in again and call `setToken`. */
  | 'unauthorized';

export interface RunEvent {
  type: RunEventType;
  correlationId: string;
  data?: any;
  error?: string;
  /** The Server's own event name (onAction, onTaskEnd, …). */
  event: string;
  [key: string]: unknown;
}

export interface RunHandle {
  correlationId: string;
  /** Settles with the run's last event (`end_all` or `error`). Rejects with
   *  ConnectionLostError if the connection drops first: the run keeps going on the Server,
   *  so look it up again (pipelineList / pipelineDetail) once reconnected. */
  done: Promise<RunEvent>;
  /** Stops listening. Does not cancel the run (send `pipelineCancel` for that). */
  stopListening(): void;
}

export interface ServerMessage {
  event: string;
  correlationId?: string;
  data?: any;
  error?: string;
  [key: string]: unknown;
}

export class RequestTimeoutError extends Error {
  constructor(readonly command: string) {
    super(`No answer from the server for "${command}"`);
    this.name = 'RequestTimeoutError';
  }
}

/** The connection dropped after the command was sent, so its answer will never arrive. */
export class ConnectionLostError extends Error {
  constructor(readonly command: string) {
    super(`The connection dropped before "${command}" was answered`);
    this.name = 'ConnectionLostError';
  }
}

/** The Server answered the command with an error (a refused permission, a missing workflow…). */
export class CommandError extends Error {
  constructor(
    readonly command: string,
    message: string
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

/** The standard WebSocket constructor; tests and Node pass another. */
type WebSocketLike = {
  readonly readyState: number;
  readonly protocol: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: any) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev: any) => void) | null;
};
type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike;

export interface TipelineClientOptions {
  /** Server address: wss://, ws://, https:// or http:// (turned into ws). */
  url: string;
  token: string;
  /** Default 15 s, the same as Desktop. */
  requestTimeoutMs?: number;
  /** First retry delay; doubles up to `maxReconnectDelayMs`. Default 1 s. */
  reconnectDelayMs?: number;
  /** Default 30 s, so a phone without signal doesn't keep the radio busy. */
  maxReconnectDelayMs?: number;
  WebSocket?: WebSocketCtor;
}

interface Pending {
  command: string;
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /** False while it waits in the offline queue. */
  sent: boolean;
}

/** A command answered by several messages on its correlationId: a run, or an Assistant request. */
interface Stream {
  command: string;
  /** Handles one message on the stream's correlationId; true when it was the last. */
  receive(message: ServerMessage): boolean;
  reject(err: Error): void;
  sent: boolean;
}

const OPEN = 1;

/**
 * One WebSocket to a Tipeline Server, shared by every screen.
 *
 * - `request(command, payload)` → the answer's `data` (rejects with the Server's error).
 * - `run(command, payload, onEvent)` → live run events until `end_all` or `error`.
 * - `subscribe(listener)` → every message, for live lists (like Desktop's stream:broadcast).
 * - `ask(prompt, onUpdate)` / `runForAssistant(...)` → the Server's Assistant (editors and admins).
 *
 * Sends while offline wait in a queue and go out once connected. A lost connection retries
 * with a growing delay; a refused token stops the client.
 */
export class TipelineClient {
  private ws: WebSocketLike | null = null;
  private token: string;
  private readonly url: string;
  private readonly requestTimeoutMs: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;
  private readonly WebSocketImpl: WebSocketCtor;

  private status: ConnectionStatus = 'idle';
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Array<{ correlationId: string; message: string }> = [];
  private pending = new Map<string, Pending>();
  private streams = new Map<string, Stream>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private messageListeners = new Set<(message: ServerMessage) => void>();

  constructor(options: TipelineClientOptions) {
    this.url = wsUrlFor(options.url);
    this.token = options.token;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.baseDelay = options.reconnectDelayMs ?? 1_000;
    this.maxDelay = options.maxReconnectDelayMs ?? 30_000;
    const impl = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
    if (!impl) throw new Error('No WebSocket available: pass one in the options');
    this.WebSocketImpl = impl;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** Opens the connection. Safe to call again; does nothing while connecting or open. */
  connect(): void {
    if (this.ws || this.status === 'connecting') return;
    this.clearReconnectTimer();
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    const ws = new this.WebSocketImpl(this.url, [WS_PROTOCOL, `bearer.${this.token}`]);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.setStatus('open');
      this.flushQueue();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.handleMessage(ev.data);
    };
    // A failed handshake fires error, then close: close does the work.
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      // The Server checks the token after the handshake, so a refused client may already
      // have sent what was queued: everything fails as signed out, not as a lost connection.
      if (ev.code === UNAUTHORIZED_CLOSE_CODE) {
        this.dropInFlight((command) => this.unauthorizedError(command));
        this.failQueued(this.unauthorizedError('connect'));
        this.setStatus('unauthorized');
        return;
      }
      this.dropInFlight();
      this.scheduleReconnect();
    };
  }

  /** Closes for good (until `connect()` again): queued and in-flight requests are rejected. */
  close(): void {
    this.clearReconnectTimer();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'client closed');
    this.dropInFlight();
    this.failQueued(new ConnectionLostError('close'));
    this.attempt = 0;
    this.setStatus('idle');
  }

  /** A new token (after signing in again): reconnects with it. */
  setToken(token: string): void {
    this.token = token;
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'new token');
    this.dropInFlight();
    this.attempt = 0;
    this.status = 'idle';
    this.connect();
  }

  /** Retry now instead of waiting: call it when the app comes back to the foreground or the
   *  network returns. */
  reconnectNow(): void {
    if (this.status !== 'reconnecting') return;
    this.clearReconnectTimer();
    this.connect();
  }

  onStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Every message from the Server, including other users' run events. */
  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /** Sends a command and resolves with its answer's data. */
  request<T = any>(command: string, payload: unknown = {}, options: { timeoutMs?: number } = {}): Promise<T> {
    if (RUN_COMMANDS.has(command)) {
      return Promise.reject(new Error(`"${command}" starts a run: use run() to follow it`));
    }
    if (command === 'assistantAsk' || command === 'assistantRun') {
      return Promise.reject(new Error(`"${command}" answers in several steps: use ask() or runForAssistant()`));
    }
    if (this.status === 'unauthorized') return Promise.reject(this.unauthorizedError(command));
    const correlationId = newCorrelationId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        this.unqueue(correlationId);
        reject(new RequestTimeoutError(command));
      }, options.timeoutMs ?? this.requestTimeoutMs);
      const entry: Pending = { command, resolve, reject, timer, sent: false };
      this.pending.set(correlationId, entry);
      entry.sent = this.transmit(correlationId, command, payload);
    });
  }

  /** Starts a run (`exec`, `appRun`, …) and reports each event until it ends. */
  run(command: string, payload: unknown, onEvent: (event: RunEvent) => void = () => {}): RunHandle {
    let resolve!: (event: RunEvent) => void;
    let reject!: (err: Error) => void;
    const done = new Promise<RunEvent>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const started = this.startStream(command, payload, {
      command,
      sent: false,
      reject,
      receive: (message) => {
        const type = RUN_EVENTS[message.event];
        // A refused run is answered on the command's own event (onExec) with an error.
        const refused = !type && message.event === answerEventFor(command) && message.error;
        if (!type && !refused) return false;
        const event: RunEvent = { ...message, type: type ?? 'error', correlationId: started.correlationId };
        onEvent(event);
        if (refused || FINAL_RUN_EVENTS.has(event.type)) {
          resolve(event);
          return true;
        }
        return false;
      },
    });
    return { ...started, done };
  }

  /**
   * Asks the Server's Assistant. Updates arrive as it works (thinking, searching) and it ends
   * on an answer, a "which one?" choice, a proposed run, or "nothing fits". Nothing runs here:
   * confirm a proposal with `runForAssistant`.
   */
  ask(
    prompt: string,
    onUpdate: (update: AssistantUpdate) => void = () => {},
    options: { projectIdentifier?: string } = {}
  ): AssistantHandle {
    return this.assistantStream('assistantAsk', { prompt, ...options }, onUpdate);
  }

  /**
   * Runs the workflow the user confirmed for a request, then the Assistant answers the request
   * from its outputs. `onRunEvent` gets the run's own events, to show it live.
   */
  runForAssistant(
    input: { requestId: string; identifier: string; name?: string; variables?: Record<string, unknown> },
    onUpdate: (update: AssistantUpdate) => void = () => {},
    onRunEvent: (event: RunEvent) => void = () => {}
  ): AssistantHandle {
    return this.assistantStream('assistantRun', input, onUpdate, onRunEvent);
  }

  /** Remembers which workflow the user meant for a kind of request (a choice's `requestKey`). */
  rememberAssistantChoice(requestKey: string, workflow: { identifier: string; name: string }): Promise<void> {
    return this.request('assistantChoose', { requestKey, ...workflow }).then(() => undefined);
  }

  /** The user's own requests, newest first; an admin may ask for everyone's. */
  assistantHistory(options: { scope?: 'mine' | 'everyone'; limit?: number } = {}): Promise<AssistantRequestItem[]> {
    return this.request('assistantHistory', options);
  }

  private assistantStream(
    command: string,
    payload: unknown,
    onUpdate: (update: AssistantUpdate) => void,
    onRunEvent?: (event: RunEvent) => void
  ): AssistantHandle {
    let resolve!: (update: AssistantUpdate) => void;
    let reject!: (err: Error) => void;
    const done = new Promise<AssistantUpdate>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const answerEvent = answerEventFor(command);
    const started = this.startStream(command, payload, {
      command,
      sent: false,
      reject,
      receive: (message) => {
        const type = RUN_EVENTS[message.event];
        if (type) {
          onRunEvent?.({ ...message, type, correlationId: started.correlationId });
          return false;
        }
        if (message.event !== answerEvent) return false;
        const update: AssistantUpdate = {
          ...(message.data && typeof message.data === 'object' ? message.data : {}),
          ...(message.error ? { error: String(message.error) } : {}),
        };
        onUpdate(update);
        if (update.error) {
          reject(new CommandError(command, update.error));
          return true;
        }
        if (update.phase && ASSISTANT_FINAL_PHASES.has(update.phase)) {
          resolve(update);
          return true;
        }
        return false;
      },
    });
    // Nobody may be waiting on `done` when the callbacks are all the caller uses.
    done.catch(() => {});
    return { ...started, done };
  }

  private startStream(command: string, payload: unknown, stream: Stream) {
    const correlationId = newCorrelationId();
    const handle = {
      correlationId,
      stopListening: () => {
        this.streams.delete(correlationId);
        this.unqueue(correlationId);
      },
    };
    if (this.status === 'unauthorized') {
      stream.reject(this.unauthorizedError(command));
      return handle;
    }
    this.streams.set(correlationId, stream);
    stream.sent = this.transmit(correlationId, command, payload);
    return handle;
  }

  // ---------------------------------------------------------------------------

  /** Sends now when open, else queues. Returns whether it went out. */
  private transmit(correlationId: string, command: string, payload: unknown): boolean {
    const message = JSON.stringify({ event: command, correlationId, payload });
    if (this.ws && this.ws.readyState === OPEN && this.status === 'open') {
      this.ws.send(message);
      return true;
    }
    this.queue.push({ correlationId, message });
    if (this.status === 'idle') this.connect();
    return false;
  }

  private flushQueue(): void {
    const queued = this.queue.splice(0);
    for (const { correlationId, message } of queued) {
      this.ws?.send(message);
      const pending = this.pending.get(correlationId);
      if (pending) pending.sent = true;
      const stream = this.streams.get(correlationId);
      if (stream) stream.sent = true;
    }
  }

  private unqueue(correlationId: string): void {
    this.queue = this.queue.filter((q) => q.correlationId !== correlationId);
  }

  private handleMessage(raw: unknown): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (!message || typeof message.event !== 'string') return;

    for (const listener of this.messageListeners) {
      try {
        listener(message);
      } catch (err) {
        console.error('[TipelineClient] listener failed:', err);
      }
    }

    const id = message.correlationId;
    if (!id) return;

    const stream = this.streams.get(id);
    if (stream) {
      if (stream.receive(message)) this.streams.delete(id);
      return;
    }

    const pending = this.pending.get(id);
    if (!pending || message.event !== answerEventFor(pending.command)) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (message.error) pending.reject(new CommandError(pending.command, String(message.error)));
    else pending.resolve(message.data);
  }

  /** Commands already sent will never be answered on a new connection. Queued ones wait. */
  private dropInFlight(
    errorFor: (command: string) => Error = (command) => new ConnectionLostError(command)
  ): void {
    for (const [id, pending] of this.pending) {
      if (!pending.sent) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(errorFor(pending.command));
    }
    for (const [id, stream] of this.streams) {
      if (!stream.sent) continue;
      this.streams.delete(id);
      stream.reject(errorFor(stream.command));
    }
  }

  private failQueued(err: Error): void {
    for (const { correlationId } of this.queue) {
      const pending = this.pending.get(correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(correlationId);
        pending.reject(err);
      }
      const stream = this.streams.get(correlationId);
      if (stream) {
        this.streams.delete(correlationId);
        stream.reject(err);
      }
    }
    this.queue = [];
  }

  private unauthorizedError(command: string): CommandError {
    return new CommandError(command, 'The server refused the sign-in. Sign in again.');
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.baseDelay * 2 ** this.attempt, this.maxDelay);
    this.attempt += 1;
    this.setStatus('reconnecting');
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

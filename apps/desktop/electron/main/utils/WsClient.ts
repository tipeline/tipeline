import { WebSocket } from 'ws';

interface QueuedMessage {
  event: string;
  payload: any;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private destroyed = false;
  private handlers = new Map<string, (response: any) => void>();
  private messageQueue: QueuedMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly RECONNECT_DELAY_MS = 3000;
  private onDisconnectCb: (() => void) | null = null;
  private onReconnectCb: (() => void) | null = null;
  private hasConnected = false;

  constructor(
    private readonly host: string,
    private readonly token: string
  ) {}

  init(
    listeners: Record<string, (response: any) => void>,
    onDisconnect?: () => void,
    onReconnect?: () => void
  ): Promise<void> {
    for (const [event, handler] of Object.entries(listeners)) {
      this.handlers.set(event, handler);
    }
    this.onDisconnectCb = onDisconnect ?? null;
    this.onReconnectCb = onReconnect ?? null;
    return this.connect();
  }

  private connect(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.host, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
      } catch (err) {
        return reject(err);
      }

      const onOpen = () => {
        this.isConnected = true;
        console.log(`[WsClient] Connected to ${this.host}`);
        this.flushQueue();
        if (this.hasConnected) this.onReconnectCb?.();
        this.hasConnected = true;
        resolve();
      };

      const onError = (err: Error) => {
        console.error('[WsClient] Connection error:', err.message);
        reject(err);
      };

      this.ws.once('open', onOpen);
      this.ws.once('error', onError);

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          const { event, ...rest } = msg;
          const handler = this.handlers.get(event);
          if (handler) handler(rest);
        } catch {
          // ignore malformed messages
        }
      });

      this.ws.on('close', () => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.ws = null;
        console.log('[WsClient] Disconnected, scheduling reconnect...');
        if (wasConnected) this.onDisconnectCb?.();
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // next scheduleReconnect will be triggered by the close event
      });
    }, this.RECONNECT_DELAY_MS);
  }

  send(event: string, payload: any): void {
    const msg = JSON.stringify({ event, ...payload });
    if (this.isConnected && this.ws) {
      this.ws.send(msg);
    } else {
      this.messageQueue.push({ event, payload });
    }
  }

  private flushQueue(): void {
    const pending = this.messageQueue.splice(0);
    for (const { event, payload } of pending) {
      this.send(event, payload);
    }
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.terminate();
    this.ws = null;
    this.isConnected = false;
    this.handlers.clear();
    this.messageQueue = [];
  }
}

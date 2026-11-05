import { timingSafeEqual } from 'crypto';
import { runHandler, type ITransport } from '@engine/ITransport';

// How long a connected socket has to send `authenticate` before it's dropped.
const AUTH_GRACE_MS = 5000;

export class IpcTransport implements ITransport {
  private authenticated = new WeakSet<object>();

  constructor(
    private ipc: any,
    private token: string
  ) {}

  // node-ipc only creates `ipc.server` inside `ipc.serve()` — calling this before that runs
  // throws on `undefined.on(...)`. Must be invoked from inside the `ipc.serve(callback)`
  // callback, not from this constructor (which Server.ts calls beforehand).
  attach(): void {
    // node-ipc publishes whatever event name a message carries, and the publisher throws on a
    // missing one, in a socket callback: without this, one bad message from any client would
    // end Core and every run in it.
    const publish = this.ipc.server.publish.bind(this.ipc.server);
    this.ipc.server.publish = (type: unknown, ...args: unknown[]) => {
      if (typeof type !== 'string') {
        console.warn('[IPC] Ignored a message with no event name');
        return;
      }
      return publish(type, ...args);
    };

    this.ipc.server.on('connect', (socket: any) => {
      setTimeout(() => {
        if (!this.authenticated.has(socket)) {
          socket.destroy?.();
        }
      }, AUTH_GRACE_MS);
    });

    // A fresh connection to this socket has no identity at all — node-ipc has no concept
    // of a client, so anything that can reach the socket could otherwise send any event
    // (including `run`/`exec` with an arbitrary task) with no authentication whatsoever.
    // Every client must present this token before any other event is dispatched.
    this.ipc.server.on('authenticate', (data: any, socket: any) => {
      const provided = typeof data?.token === 'string' ? data.token : '';
      const providedBuffer = Buffer.from(provided);
      const expectedBuffer = Buffer.from(this.token);
      const ok =
        providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

      if (ok) {
        this.authenticated.add(socket);
        this.ipc.server.emit(socket, 'authenticated', { ok: true });
      } else {
        this.ipc.server.emit(socket, 'unauthorized', { ok: false });
      }
    });
  }

  on(event: string, handler: (message: any, client: any) => void): void {
    this.ipc.server.on(event, (message: any, client: any) => {
      if (!this.authenticated.has(client)) {
        this.ipc.server.emit(client, 'unauthorized', { ok: false, event });
        return;
      }
      runHandler(event, handler, message, client);
    });
  }

  emit(client: any, event: string, data: any): void {
    this.ipc.server.emit(client, event, data);
  }

  broadcast(event: string, data: any): void {
    this.ipc.server.broadcast(event, data);
  }

  stop(): void {
    this.ipc.server.stop();
  }
}

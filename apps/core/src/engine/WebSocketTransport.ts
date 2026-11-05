import { timingSafeEqual } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { runHandler, type ITransport } from '@engine/ITransport';

export class WebSocketTransport implements ITransport {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private handlers = new Map<string, (message: any, client: WebSocket) => void>();
  private token: string;

  constructor(port: number, token: string, host = '127.0.0.1') {
    this.token = token;
    const wss = new WebSocketServer({ port, host, maxPayload: 10 * 1024 * 1024 });
    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[WebSocket] Port ${port} already in use — running in IPC-only mode.`);
        wss.close();
      } else {
        throw err;
      }
    });
    wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    wss.on('listening', () => {
      this.wss = wss;
      console.log(`[WebSocket] Listening on ${host}:${port}`);
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const auth = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }
    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(this.token);
    if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    this.clients.add(ws);
    console.log(`[WebSocket] Client connected (${this.clients.size} total)`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { event, ...rest } = msg;
        const handler = this.handlers.get(event);
        if (handler) {
          runHandler(event, handler, rest, ws);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[WebSocket] Client disconnected (${this.clients.size} remaining)`);
    });

    ws.on('error', (err) => {
      console.error('[WebSocketTransport] Client error:', err);
      this.clients.delete(ws);
      ws.terminate();
    });
  }

  on(event: string, handler: (message: any, client: any) => void): void {
    this.handlers.set(event, handler);
  }

  emit(client: WebSocket, event: string, data: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, ...data }));
    }
  }

  broadcast(event: string, data: any): void {
    const msg = JSON.stringify({ event, ...data });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (err) {
          console.error('[WebSocketTransport] Failed to send to client:', err);
          this.clients.delete(client);
        }
      }
    }
  }

  stop(): void {
    for (const client of this.clients) {
      client.terminate();
    }
    this.wss?.close();
  }
}

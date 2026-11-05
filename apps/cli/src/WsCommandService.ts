import WebSocket from 'ws';

export interface RemoteConnection {
  name: string;
  host: string;
  token: string;
}

type IpcResponse = {
  success: boolean;
  data: any;
  error?: string;
  correlationId?: string;
};

/**
 * Mirrors connectAndHandle over a WebSocket connection to a remote Core.
 * Message format: client→server { event, correlationId, payload }
 *                 server→client { event, success, data, error, correlationId }
 */
export class WsCommandService {
  static connectAndHandle(
    connection: RemoteConnection,
    eventToSend: string,
    payload: unknown,
    listeners: Record<string, (data: IpcResponse) => void>,
    onError?: () => void
  ): void {
    let ws: WebSocket;

    try {
      ws = new WebSocket(connection.host, {
        headers: { Authorization: `Bearer ${connection.token}` },
      });
    } catch (err: any) {
      console.error(`[remote] Failed to connect to ${connection.host}: ${err.message}`);
      if (onError) { onError(); return; }
      process.exit(1);
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: eventToSend, ...(payload as object) }));
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string } & IpcResponse;
        const { event, ...rest } = msg;
        const handler = listeners[event];
        if (handler) handler(rest as IpcResponse);
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('error', (err) => {
      console.error(`[remote] WebSocket error: ${err.message}`);
      if (onError) { ws.terminate(); onError(); return; }
      process.exit(1);
    });

    ws.on('close', (code) => {
      if (code === 4001) {
        console.error(`[remote] Authentication failed — check the token for ${connection.host}`);
        process.exit(1);
      }
      // Nothing here closes it on purpose, and a watched run would otherwise wait forever.
      console.error(`[remote] Lost the connection to ${connection.host}`);
      process.exit(1);
    });
  }
}

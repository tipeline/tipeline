import ipc from 'node-ipc';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface QueuedMessage {
  event: string;
  payload: any;
}

// Core now requires every IPC client to authenticate before it will dispatch any other
// event — this is the token Core writes to disk on startup, not fetched over IPC itself
// (that would require IPC to stay unauthenticated for the fetch).
function readCoreToken(): string {
  try {
    return fs.readFileSync(path.join(os.homedir(), 'Tipeline', '.database', 'core.token'), 'utf8').trim();
  } catch {
    return '';
  }
}

export class IpcClient {
  private static readonly alias = 'tipeline_core';
  private static conn: any = null;
  private static isConnected = false;
  private static attachedEvents = new Set<string>();
  private static messageQueue: QueuedMessage[] = [];
  private static hasConnected = false;

  static init(
    listeners: Record<string, (...args: any[]) => void> = {},
    onDisconnect?: () => void,
    onReconnect?: () => void
  ) {
    return new Promise<void>((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      ipc.config.id = 'tipeline_client';
      ipc.config.retry = 1500;
      ipc.config.silent = true;
      if (process.env.TIPELINE_IPC_SOCKET_ROOT) {
        ipc.config.socketRoot = process.env.TIPELINE_IPC_SOCKET_ROOT;
      }

      ipc.connectTo(this.alias, () => {
        const conn = ipc.of[this.alias];

        if (!conn || typeof conn.emit !== 'function') {
          return reject(new Error(`[IpcClient] Failed to connect to "${this.alias}"`));
        }

        conn.on('connect', () => {
          // Refresh reference in case node-ipc recreated the socket
          this.conn = ipc.of[this.alias];
          this.isConnected = true;
          console.log(`[IpcClient] Connected to "${this.alias}", registering ${Object.keys(listeners).length} handlers`);
          this.conn.emit('authenticate', { token: readCoreToken() });
          this.attachListeners(listeners);
          this.flushQueue();
          if (this.hasConnected) onReconnect?.();
          this.hasConnected = true;
          resolve();
        });

        conn.on('disconnect', () => {
          this.conn = null;
          this.isConnected = false;
          // attachedEvents stays: node-ipc reconnects with the same object, which keeps
          // its listeners, so attaching them again would fire every handler twice.
          onDisconnect?.();
        });

        conn.on('error', (err: Error) => {
          console.error('[IpcClient] Socket error:', err.message);
        });
      });
    });
  }

  private static attachListeners(listeners: Record<string, (...args: any[]) => void>) {
    for (const [event, handler] of Object.entries(listeners)) {
      if (!this.attachedEvents.has(event)) {
        this.conn.on(event, handler);
        this.attachedEvents.add(event);
      }
    }
  }

  private static flushQueue() {
    const pending = this.messageQueue.splice(0);
    for (const { event, payload } of pending) {
      this.conn.emit(event, payload);
    }
  }

  static send(event: string, payload: any) {
    if (!this.conn || !this.isConnected) {
      // Buffer messages while disconnected; flushed on reconnect
      this.messageQueue.push({ event, payload });
      return;
    }
    this.conn.emit(event, payload);
  }
}

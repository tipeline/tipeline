import { IpcClient } from './IpcClient';
import type { WsClient } from './WsClient';

export interface ICoreClient {
  init(
    listeners: Record<string, (response: any) => void>,
    onDisconnect?: () => void,
    onReconnect?: () => void
  ): Promise<void>;
  send(event: string, payload: any): void;
}

// Wraps the static IpcClient in the ICoreClient interface
const localClient: ICoreClient = {
  init: (listeners, onDisconnect, onReconnect) => IpcClient.init(listeners, onDisconnect, onReconnect),
  send: (event, payload) => IpcClient.send(event, payload),
};

let active: ICoreClient = localClient;
let activeWsClient: WsClient | null = null;

export const CoreClientProxy = {
  send(event: string, payload: any): void {
    active.send(event, payload);
  },

  async switchToLocal(
    listeners: Record<string, (response: any) => void>,
    onDisconnect?: () => void,
    onReconnect?: () => void
  ): Promise<void> {
    if (activeWsClient) {
      activeWsClient.disconnect();
      activeWsClient = null;
    }
    active = localClient;
    await active.init(listeners, onDisconnect, onReconnect);
  },

  async switchToRemote(
    wsClient: WsClient,
    listeners: Record<string, (response: any) => void>,
    onDisconnect?: () => void,
    onReconnect?: () => void
  ): Promise<void> {
    if (activeWsClient) {
      activeWsClient.disconnect();
      activeWsClient = null;
    }
    // Init before swapping active — if it throws, active stays on local IPC
    await wsClient.init(listeners, onDisconnect, onReconnect);
    activeWsClient = wsClient;
    active = wsClient;
  },
};

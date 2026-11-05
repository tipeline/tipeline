import { CoreClientProxy } from './CoreClientProxy';
import { IpcClient } from './IpcClient';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CoreService {
  private static readonly pending = new Map<string, PendingRequest>();
  private static readonly TIMEOUT_MS = 15_000;

  static request<T = any>(
    coreEvent: string,
    payload: { correlationId: string; [key: string]: any },
    timeoutMs: number = this.TIMEOUT_MS
  ): Promise<T> {
    const { correlationId } = payload;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error(`Core timeout: ${coreEvent}`));
      }, timeoutMs);

      this.pending.set(correlationId, { resolve, reject, timer });
      CoreClientProxy.send(coreEvent, payload);
    });
  }

  /** Always routes to local Core via IPC — used for connection management. */
  static localRequest<T = any>(
    coreEvent: string,
    payload: { correlationId: string; [key: string]: any }
  ): Promise<T> {
    const { correlationId } = payload;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error(`Core timeout: ${coreEvent}`));
      }, this.TIMEOUT_MS);
      this.pending.set(correlationId, { resolve, reject, timer });
      IpcClient.send(coreEvent, payload);
    });
  }

  static settle(correlationId: string, data: any, error?: string) {
    const pending = this.pending.get(correlationId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(correlationId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(data);
    }
  }
}

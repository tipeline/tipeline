export interface ITransport {
  on(event: string, handler: (message: any, client: any) => void): void;
  emit(client: any, event: string, data: any): void;
  broadcast(event: string, data: any): void;
  stop(): void;
}

/**
 * Runs a client's event. Handlers trust the message's shape, so a bad one can throw, or reject if
 * the handler is async: that's the client's mistake and only ends this event, not Core.
 */
export function runHandler(
  event: string,
  handler: (message: any, client: any) => unknown,
  message: any,
  client: any
): void {
  const report = (error: any) => console.error(`[Core] Event "${event}" failed:`, error?.message ?? error);
  try {
    Promise.resolve(handler(message, client)).catch(report);
  } catch (error) {
    report(error);
  }
}

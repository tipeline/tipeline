import type { ActionErrorData } from '@tipeline/types';

class IPCMessage<T = any> {
  success: boolean;
  data: T | null;
  error: string | ActionErrorData | null;
  correlationId: string | null;

  constructor(
    success: boolean,
    data: T | null = null,
    error: string | ActionErrorData | null = null,
    correlationId: string | null = null
  ) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.correlationId = correlationId;
  }

  static success<T>(data: T, correlationId: string | null = null) {
    return new IPCMessage<T>(true, data, null, correlationId);
  }

  static failure(error: string | ActionErrorData, correlationId: string | null = null) {
    return new IPCMessage(false, null, error, correlationId);
  }
}

export default IPCMessage;

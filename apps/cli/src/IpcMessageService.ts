export default class IpcMessageService {
  constructor() {}

  static async generatePayload(correlationId: string, initialPayload: any) {
    const payload = {
      correlationId,
      payload: initialPayload,
    };

    return payload;
  }
}

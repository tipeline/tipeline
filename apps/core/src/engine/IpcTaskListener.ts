import ipc from 'node-ipc';
import { coreEvents } from '@engine/CoreEvents';
import IPCMessage from '@engine/IPCMessage';
export class IpcTaskListener {
  private correlationId: string;

  constructor(_socket: any, correlationId: string) {
    this.correlationId = correlationId;
  }

  bind() {
    coreEvents.on(`action:${this.correlationId}`, this.onAction);
    coreEvents.on(`taskStart:${this.correlationId}`, this.onTaskStart);
    coreEvents.on(`taskEnd:${this.correlationId}`, this.onTaskEnd);
  }

  unbind() {
    coreEvents.off(`action:${this.correlationId}`, this.onAction);
    coreEvents.off(`taskStart:${this.correlationId}`, this.onTaskStart);
    coreEvents.off(`taskEnd:${this.correlationId}`, this.onTaskEnd);
  }

  private onTaskStart = (data: any) => {
    ipc.server.broadcast('onTaskStart', IPCMessage.success(data, this.correlationId));
  };

  private onTaskEnd = (data: any) => {
    ipc.server.broadcast('onTaskEnd', IPCMessage.success(data, this.correlationId));
  };

  private onAction = (data: any) => {
    ipc.server.broadcast('onAction', IPCMessage.success(data, this.correlationId));
  };
}

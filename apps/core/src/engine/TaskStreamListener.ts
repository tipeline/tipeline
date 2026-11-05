import { coreEvents } from '@engine/CoreEvents';
import IPCMessage from '@engine/IPCMessage';

type BroadcastFn = (event: string, data: any) => void;

export class TaskStreamListener {
  constructor(
    private correlationId: string,
    private broadcast: BroadcastFn
  ) {}

  bind(): void {
    coreEvents.on(`action:${this.correlationId}`, this.onAction);
    coreEvents.on(`actionError:${this.correlationId}`, this.onActionError);
    coreEvents.on(`taskStart:${this.correlationId}`, this.onTaskStart);
    coreEvents.on(`taskEnd:${this.correlationId}`, this.onTaskEnd);
    coreEvents.on(`paused:${this.correlationId}`, this.onPaused);
  }

  unbind(): void {
    coreEvents.off(`action:${this.correlationId}`, this.onAction);
    coreEvents.off(`actionError:${this.correlationId}`, this.onActionError);
    coreEvents.off(`taskStart:${this.correlationId}`, this.onTaskStart);
    coreEvents.off(`taskEnd:${this.correlationId}`, this.onTaskEnd);
    coreEvents.off(`paused:${this.correlationId}`, this.onPaused);
  }

  private onTaskStart = (data: any) => {
    this.broadcast('onTaskStart', IPCMessage.success(data, this.correlationId));
  };

  private onTaskEnd = (data: any) => {
    this.broadcast('onTaskEnd', IPCMessage.success(data, this.correlationId));
  };

  private onAction = (data: any) => {
    this.broadcast('onAction', IPCMessage.success(data, this.correlationId));
  };

  private onActionError = (data: any) => {
    this.broadcast('onActionError', IPCMessage.success(data, this.correlationId));
  };

  private onPaused = (data: any) => {
    this.broadcast('onDebugPaused', IPCMessage.success(data, this.correlationId));
  };
}

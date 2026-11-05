import { ref, onUnmounted } from 'vue';
import { generateIdentifier } from '@tipeline/utils';
import type { StreamEvent, StreamEventType } from '@/store/stream';

const TERMINAL: Set<StreamEventType> = new Set(['end_all', 'error']);

/**
 * Sends a streaming request to tipeline-core and receives push events back.
 *
 * Each execute() call creates a unique correlationId. The main process forwards
 * core push events on the channel `stream:<correlationId>` so only this
 * composable instance receives them — no global bus needed.
 *
 * Events are written to the local `events` ref AND to streamStore so that
 * cross-component views (e.g. HomeRecentActivity) can observe all executions.
 */
export function useStream() {
  const events = ref<StreamEvent[]>([]);
  const isRunning = ref(false);
  const currentCorrelationId = ref<string | null>(null);

  let activeChannel: string | null = null;
  let activeHandler: ((_: any, response: any) => void) | null = null;

  function cleanup() {
    if (activeChannel && activeHandler) {
      window.ipcRenderer.off(activeChannel, activeHandler);
      activeChannel = null;
      activeHandler = null;
    }
  }

  function execute(sendChannel: string, payload: any = {}) {
    cleanup();
    events.value = [];

    const correlationId = generateIdentifier();
    currentCorrelationId.value = correlationId;
    activeChannel = `stream:${correlationId}`;
    isRunning.value = true;

    activeHandler = (_: any, response: any) => {
      const event: StreamEvent = {
        type: response.type as StreamEventType,
        correlationId,
        taskIdentifier: response.data?.taskIdentifier ?? '',
        pipelineIdentifier: response.data?.pipelineIdentifier ?? '',
        timestamp: Date.now(),
        data: response.data,
        error: response.error ?? undefined,
      };

      events.value.push(event);

      if (TERMINAL.has(event.type)) {
        isRunning.value = false;
        cleanup();
      }
    };

    window.ipcRenderer.on(activeChannel, activeHandler);
    window.ipcRenderer.send(sendChannel, { correlationId, payload });
  }

  function stop() {
    cleanup();
    isRunning.value = false;
  }

  onUnmounted(cleanup);

  return { execute, events, isRunning, stop, currentCorrelationId };
}

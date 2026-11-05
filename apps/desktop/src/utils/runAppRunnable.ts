import { generateIdentifier } from '@tipeline/utils';
import { SEND } from '@/ipc-channels';

export interface AppRunResult {
  pipelineIdentifier: string;
  outputs: Record<string, unknown>;
  /**
   * 'paused' when the workflow stopped at an approval step (no outputs yet);
   * 'canceled' when someone canceled it.
   */
  status: 'completed' | 'paused' | 'canceled';
  /** Set when the outputs came from the workflow cache: when they were produced (ISO). */
  cachedAt?: string;
}

/** A step of a run as it happens (for a Run Console). */
export interface AppRunEvent {
  type: 'start' | 'action' | 'action_error';
  data: any;
}

/**
 * Runs an app runnable (`mode: run`) through core's `appRun` and resolves with the
 * run's outputs once it has fully finished, or rejects with the run's error.
 *
 * Core resolves the workflow, outputs and persistence from the app's stored source;
 * the caller only names the runnable and supplies the values it resolved for the
 * runnable's declared inputs. Each call owns its own correlationId/channel, so
 * concurrent runs never interfere. Events still go out on `stream:broadcast`, so
 * app-triggered runs appear in Activity like any other run.
 */
export function runAppRunnable(
  params: {
    appIdentifier: string;
    pageId: string;
    runnable: string;
    inputs: Record<string, unknown>;
    /** 'refresh' runs the workflow even when its outputs are cached. */
    cache?: 'refresh';
  },
  onEvent?: (event: AppRunEvent) => void,
  /** The request's id; callers pass one to recognize the run's broadcast events. */
  correlationId: string = generateIdentifier()
): Promise<AppRunResult> {
  return new Promise((resolve, reject) => {
    const channel = `stream:${correlationId}`;

    const handler = (_: any, response: any) => {
      if (
        response.type === 'start' ||
        response.type === 'action' ||
        response.type === 'action_error'
      ) {
        onEvent?.({ type: response.type, data: response.data ?? {} });
        return;
      }
      if (response.type === 'end_all') {
        window.ipcRenderer.off(channel, handler);
        resolve({
          pipelineIdentifier: response.data?.pipelineIdentifier ?? '',
          outputs: response.data?.outputs ?? {},
          status:
            response.data?.status === 'paused' ||
            response.data?.status === 'canceled'
              ? response.data.status
              : 'completed',
          ...(response.data?.cached ? { cachedAt: response.data.cachedAt } : {}),
        });
      } else if (response.type === 'error') {
        window.ipcRenderer.off(channel, handler);
        const error = response.error;
        reject(
          new Error(typeof error === 'string' ? error : (error?.message ?? ''))
        );
      }
    };

    window.ipcRenderer.on(channel, handler);
    window.ipcRenderer.send(SEND.APP_RUN, { correlationId, payload: params });
  });
}

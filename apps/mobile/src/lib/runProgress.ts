import type { RunEvent } from '@tipeline/client';
import type { StepInfo, WorkflowVariable } from './workflows';

export type StepState = 'waiting' | 'done' | 'failed';
export type RunState = 'idle' | 'starting' | 'running' | 'finished' | 'failed' | 'lost';

export interface RunProgress {
  state: RunState;
  pipelineIdentifier: string | null;
  steps: Array<StepInfo & { state: StepState; error?: string }>;
  /** Latest value of every variable a step changed. */
  values: Record<string, unknown>;
  error: string | null;
}

export function startProgress(steps: StepInfo[]): RunProgress {
  return {
    state: 'starting',
    pipelineIdentifier: null,
    steps: steps.map((s) => ({ ...s, state: 'waiting' })),
    values: {},
    error: null,
  };
}

const errorText = (error: unknown): string =>
  typeof error === 'string' ? error : (error as { message?: string })?.message ?? 'Unknown error';

/**
 * Applies one live event. Events for steps inside blocks or sub-workflows have identifiers
 * that aren't top-level steps: their changed variables still count, the step list doesn't.
 */
export function applyRunEvent(progress: RunProgress, event: RunEvent): RunProgress {
  const next: RunProgress = { ...progress, steps: progress.steps, values: progress.values };
  const data = event.data ?? {};

  switch (event.type) {
    case 'start':
      // A sub-workflow starts its own run on the same stream: keep the first one.
      next.pipelineIdentifier ??= data.pipelineIdentifier ?? null;
      next.state = 'running';
      break;
    case 'action':
    case 'action_error': {
      const failed = event.type === 'action_error';
      next.steps = progress.steps.map((s) =>
        s.identifier === data.identifier
          ? { ...s, state: failed ? 'failed' : 'done', ...(failed ? { error: errorText(event.error ?? data.error) } : {}) }
          : s
      );
      const changed = Array.isArray(data.changedVariables) ? data.changedVariables : [];
      if (changed.length) {
        next.values = { ...progress.values };
        for (const v of changed) if (v && typeof v.name === 'string') next.values[v.name] = v.value;
      }
      break;
    }
    case 'error':
      next.state = 'failed';
      next.error = errorText(event.error ?? data);
      break;
    case 'end_all':
      if (next.state !== 'failed') next.state = 'finished';
      break;
  }
  return next;
}

/** The outputs to show once a run finished, in source order, only those that got a value. */
export function finalOutputs(
  progress: RunProgress,
  outputs: WorkflowVariable[]
): Array<{ variable: WorkflowVariable; value: unknown }> {
  return outputs
    .filter((v) => Object.prototype.hasOwnProperty.call(progress.values, v.name))
    .map((variable) => ({ variable, value: progress.values[variable.name] }));
}

/** A value as text for the result card. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

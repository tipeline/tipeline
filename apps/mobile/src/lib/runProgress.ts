import type { RunEvent } from '@tipeline/client';
import type { StepInfo, WorkflowVariable } from './workflows';

/** `canceled`, `skipped` and `paused` come from the finished run's detail, not live events. */
export type StepState = 'waiting' | 'done' | 'failed' | 'canceled' | 'skipped' | 'paused';
/** `canceled` and `paused` (waiting at an approval) come from the run's final status. */
export type RunState = 'idle' | 'starting' | 'running' | 'finished' | 'failed' | 'canceled' | 'paused' | 'lost';

export interface RunProgress {
  state: RunState;
  pipelineIdentifier: string | null;
  steps: Array<StepInfo & { state: StepState; error?: string }>;
  /** Latest value of every variable a step changed; the run's final values once it ended. */
  values: Record<string, unknown>;
  /** Variables Core keeps the value of to itself (secret or from the environment). */
  hidden: string[];
  /** True once the final values were read from the finished run. */
  final: boolean;
  error: string | null;
}

export function startProgress(steps: StepInfo[]): RunProgress {
  return {
    state: 'starting',
    pipelineIdentifier: null,
    steps: steps.map((s) => ({ ...s, state: 'waiting' })),
    values: {},
    hidden: [],
    final: false,
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

/** A finished run's variables as Core reports them (pipelineDetail). */
export interface FinalVariable {
  name: string;
  value: unknown;
  scope?: string;
  hidden?: boolean;
}

const FINAL_STATES: Record<string, RunState> = { failed: 'failed', canceled: 'canceled', paused: 'paused' };

/**
 * The run's final values, over what the live events said: an output a step never changed
 * keeps its starting value, which no event carries. Only the run's own variables count.
 * The stream ends the same way for a canceled run or one waiting at an approval: the run's
 * stored `status` tells them apart.
 */
export function withFinalValues(progress: RunProgress, variables: FinalVariable[], status?: string): RunProgress {
  const values = { ...progress.values };
  const hidden: string[] = [];
  for (const v of variables) {
    if (!v || typeof v.name !== 'string' || (v.scope && v.scope !== 'task')) continue;
    if (v.hidden) hidden.push(v.name);
    else values[v.name] = v.value;
  }
  const state = (status && FINAL_STATES[status]) || progress.state;
  return { ...progress, values, hidden, final: true, state };
}

/**
 * How each step ended, from the finished run's detail (runSteps): live events never say
 * that a step was canceled, or that one never ran because the run stopped before it.
 */
export function withStepStates(
  progress: RunProgress,
  steps: Array<{ identifier: string; state: string; error?: string }>
): RunProgress {
  const ended = new Map(steps.map((s) => [s.identifier, s]));
  return {
    ...progress,
    steps: progress.steps.map((step) => {
      const found = ended.get(step.identifier);
      if (!found || !['done', 'failed', 'canceled', 'skipped', 'paused'].includes(found.state)) return step;
      return { ...step, state: found.state as StepState, ...(found.error ? { error: found.error } : {}) };
    }),
  };
}

/** The outputs to show once a run finished, in source order, only those that got a value. */
export function finalOutputs(
  progress: RunProgress,
  outputs: WorkflowVariable[]
): Array<{ variable: WorkflowVariable; value: unknown }> {
  return outputs
    .filter((v) => Object.prototype.hasOwnProperty.call(progress.values, v.name) || progress.hidden.includes(v.name))
    .map((variable) => ({ variable, value: progress.values[variable.name] }));
}

/** A value as text for the result card. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

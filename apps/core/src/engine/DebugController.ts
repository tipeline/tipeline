import { coreEvents } from '@engine/CoreEvents';
import { RunCanceledSignal } from '@utils/errors';

/**
 * What a paused run does next: `next` runs the step it waits at (then pauses again
 * before the one after while stepping), `skip` leaves that step out, `retry` runs a
 * failed step again. At a failed step, `next` lets the run fail as it would have.
 * (Step over and Step out are `next` with a depth to run to; see onCommand.)
 */
export type DebugDecision = 'next' | 'skip' | 'retry';

/** A step's settings changed in the debugger, for the rest of the run. */
export interface StepOverride {
  params: any;
  destination?: string;
}

/** Where a step runs: its workflow, and how many sub-workflows deep that is (0: the run's own). */
export interface StepScope {
  taskIdentifier: string;
  callDepth: number;
}

/** The step a paused run waits at: the Block that waits, and how it reacts to edits. */
interface PausePoint {
  /** The Block that paused (its identity) and how deep it is, for "Next pass". */
  block: object;
  depth: number;
  /** How many sub-workflows deep it is, for "Step out". */
  callDepth: number;
  /** Called after an edit while paused, so the step's input is shown again. */
  onEdit?: () => Promise<void>;
  /** Sets a workflow variable while paused. */
  setVariable?: (name: string, value: unknown) => Promise<void>;
}

type Gate = PausePoint & { resolve: (decision: DebugDecision) => void; reject: (err: Error) => void };

// correlationId → pending gate (awaited by Block before a step, or at a failed step)
const gates = new Map<string, Gate>();
// correlationId set — step mode active
const stepping = new Set<string>();
// correlationId set — a debugger run: a failed step pauses instead of ending the run
const debugging = new Set<string>();
// correlationId → steps to stop at: `workflow:step`, or a bare step identifier (any workflow)
const breakpoints = new Map<string, Set<string>>();
// correlationId → identifier → settings edited during the run
const overrides = new Map<string, Map<string, StepOverride>>();
// correlationId → "Next pass": don't pause again until the run leaves this block
const leaving = new Map<string, { block: object; depth: number }>();
// correlationId → "Step over" / "Step out": don't pause again until a step is no deeper
// than this (blocks, or sub-workflows)
const runUntil = new Map<string, { depth?: number; callDepth?: number }>();
// correlationId → how many blocks are running inside each other (a sub-workflow's too)
const depths = new Map<string, number>();
// correlationId → who asked to stop (empty when unknown). The step running when the
// request arrives is abandoned (see untilStopped) and the run stops there.
const stopped = new Map<string, string>();
// correlationId → aborted on stop, so a running step can end early and let go of what
// it holds (a sign-in server, a timer…)
const aborts = new Map<string, AbortController>();

function abortFor(correlationId: string): AbortController {
  let controller = aborts.get(correlationId);
  if (!controller) {
    controller = new AbortController();
    aborts.set(correlationId, controller);
  }
  return controller;
}

function release(correlationId: string, decision: DebugDecision) {
  const gate = gates.get(correlationId);
  if (!gate) return null;
  gates.delete(correlationId);
  gate.resolve(decision);
  return gate;
}

/**
 * The debugger's commands that aren't plain next/run/pause/stop, sent as one
 * `debugCommand` message: { command, ... }.
 */
function onCommand(correlationId: string, data: any) {
  const command = data?.command;
  if (command === 'next' || command === 'skip' || command === 'retry') {
    release(correlationId, command);
  } else if (command === 'nextPass') {
    // Run the rest of this pass (the block the run waits in), then pause again.
    const gate = gates.get(correlationId);
    if (gate) leaving.set(correlationId, { block: gate.block, depth: gate.depth });
    stepping.add(correlationId);
    release(correlationId, 'next');
  } else if (command === 'stepOver' || command === 'stepOut') {
    // Over: run the step it waits at to the end (a sub-workflow, a loop…), then pause.
    // Out: run the rest of the sub-workflow it's in, then pause in the one that called it.
    const gate = gates.get(correlationId);
    if (gate) {
      runUntil.set(
        correlationId,
        command === 'stepOver' ? { depth: gate.depth } : { callDepth: gate.callDepth - 1 }
      );
    }
    leaving.delete(correlationId);
    stepping.add(correlationId);
    release(correlationId, 'next');
  } else if (command === 'breakpoints') {
    breakpoints.set(correlationId, new Set(Array.isArray(data.identifiers) ? data.identifiers : []));
  } else if (command === 'updateStep' && typeof data.identifier === 'string' && data.params) {
    const map = overrides.get(correlationId) ?? new Map<string, StepOverride>();
    map.set(data.identifier, { params: data.params, destination: data.destination });
    overrides.set(correlationId, map);
    void gates.get(correlationId)?.onEdit?.();
  } else if (command === 'setVariable' && typeof data.name === 'string') {
    void gates.get(correlationId)?.setVariable?.(data.name, data.value);
  }
}

/**
 * Controls a running job from outside: debugger stepping, and stopping — the debugger's
 * Stop, or a cancel (`run:cancel`, any run). Enabled for every job by its worker, keyed
 * by the job's correlationId; sync sub-workflows run in the same job, so they stop too.
 */
export const DebugController = {
  enable(
    correlationId: string,
    startStepping = true,
    options: { debugMode?: boolean; breakpoints?: string[] } = {}
  ): void {
    if (startStepping) stepping.add(correlationId);
    if (options.debugMode) debugging.add(correlationId);
    if (options.breakpoints?.length) breakpoints.set(correlationId, new Set(options.breakpoints));

    coreEvents.on(`debug:next:${correlationId}`, () => {
      release(correlationId, 'next');
    });

    coreEvents.on(`debug:run:${correlationId}`, () => {
      stepping.delete(correlationId);
      leaving.delete(correlationId);
      runUntil.delete(correlationId);
      release(correlationId, 'next');
    });

    coreEvents.on(`debug:pause:${correlationId}`, () => {
      stepping.add(correlationId);
    });

    coreEvents.on(`debug:command:${correlationId}`, (data: unknown) => onCommand(correlationId, data));

    coreEvents.on(`debug:stop:${correlationId}`, () => DebugController.stop(correlationId, ''));
    coreEvents.on(`run:cancel:${correlationId}`, (data?: { canceledBy?: string }) =>
      DebugController.stop(correlationId, data?.canceledBy ?? '')
    );
  },

  /** Asks the run to stop. A run paused in the debugger stops right away. */
  stop(correlationId: string, canceledBy: string): void {
    stepping.delete(correlationId);
    if (!stopped.has(correlationId)) stopped.set(correlationId, canceledBy);
    const abort = abortFor(correlationId);
    if (!abort.signal.aborted) abort.abort(new RunCanceledSignal(stopped.get(correlationId) ?? ''));
    const gate = gates.get(correlationId);
    if (gate) {
      gates.delete(correlationId);
      gate.reject(new RunCanceledSignal(canceledBy));
    }
  },

  isStepping(correlationId: string): boolean {
    return stepping.has(correlationId);
  },

  /** A debugger run: a failed step waits for a decision instead of ending the run. */
  isDebugging(correlationId: string): boolean {
    return debugging.has(correlationId);
  },

  /**
   * Whether the run pauses before this step: while stepping (unless "Next pass", "Step
   * over" or "Step out" is running something to its end), or at a breakpoint.
   */
  shouldPauseBefore(
    correlationId: string,
    identifier: string,
    block: object,
    depth: number,
    scope?: StepScope
  ): boolean {
    const marks = breakpoints.get(correlationId);
    if (marks?.has(identifier) || (scope && marks?.has(`${scope.taskIdentifier}:${identifier}`))) {
      leaving.delete(correlationId);
      runUntil.delete(correlationId);
      return true;
    }
    if (!stepping.has(correlationId)) return false;
    const out = leaving.get(correlationId);
    if (out && (depth > out.depth || (depth === out.depth && block === out.block))) return false;
    const until = runUntil.get(correlationId);
    if (until?.depth !== undefined && depth > until.depth) return false;
    if (until?.callDepth !== undefined && (scope?.callDepth ?? 0) > until.callDepth) return false;
    leaving.delete(correlationId);
    runUntil.delete(correlationId);
    return true;
  },

  /** The settings edited in the debugger for this step, if any. */
  overrideFor(correlationId: string, identifier: string): StepOverride | undefined {
    return overrides.get(correlationId)?.get(identifier);
  },

  /** A block starts running inside the current one; returns its depth. */
  enterBlock(correlationId: string): number {
    const depth = (depths.get(correlationId) ?? 0) + 1;
    depths.set(correlationId, depth);
    return depth;
  },

  leaveBlock(correlationId: string): void {
    const depth = (depths.get(correlationId) ?? 1) - 1;
    if (depth > 0) depths.set(correlationId, depth);
    else depths.delete(correlationId);
  },

  /** Aborted (with a RunCanceledSignal as its reason) once the run is asked to stop. */
  abortSignal(correlationId: string): AbortSignal {
    return abortFor(correlationId).signal;
  },

  /**
   * Waits for a running step, but rejects with RunCanceledSignal as soon as the run is
   * asked to stop: a step that never checks (waiting for a sign-in, a slow request…)
   * can't keep a canceled run going. The step is left behind; the job's worker ends
   * with the run, which stops whatever it was still doing.
   */
  untilStopped<T>(correlationId: string, work: Promise<T>): Promise<T> {
    const signal = abortFor(correlationId).signal;
    // Settles after we stopped waiting: nobody looks at it any more.
    work.catch(() => {});
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  },

  // Returns true if a stop was requested.
  isStopped(correlationId: string): boolean {
    return stopped.has(correlationId);
  },

  /** Throws RunCanceledSignal if a stop was requested. */
  throwIfStopped(correlationId: string): void {
    if (stopped.has(correlationId)) throw new RunCanceledSignal(stopped.get(correlationId) ?? '');
  },

  /** Waits for the debugger's decision; rejects with RunCanceledSignal on Stop. */
  waitForDecision(correlationId: string, point: PausePoint): Promise<DebugDecision> {
    // Immediately reject if a stop arrived while the action was executing.
    if (stopped.has(correlationId)) {
      return Promise.reject(new RunCanceledSignal(stopped.get(correlationId) ?? ''));
    }
    return new Promise<DebugDecision>((resolve, reject) => {
      gates.set(correlationId, { ...point, resolve, reject });
    });
  },

  cleanup(correlationId: string): void {
    stepping.delete(correlationId);
    debugging.delete(correlationId);
    breakpoints.delete(correlationId);
    overrides.delete(correlationId);
    leaving.delete(correlationId);
    runUntil.delete(correlationId);
    depths.delete(correlationId);
    stopped.delete(correlationId);
    aborts.delete(correlationId);
    gates.delete(correlationId);
    coreEvents.removeAllListeners(`debug:next:${correlationId}`);
    coreEvents.removeAllListeners(`debug:run:${correlationId}`);
    coreEvents.removeAllListeners(`debug:pause:${correlationId}`);
    coreEvents.removeAllListeners(`debug:command:${correlationId}`);
    coreEvents.removeAllListeners(`debug:stop:${correlationId}`);
    coreEvents.removeAllListeners(`run:cancel:${correlationId}`);
  },
};

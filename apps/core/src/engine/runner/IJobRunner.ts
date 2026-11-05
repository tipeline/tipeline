import type { CacheMode } from '@tipeline/schemas';
// Both BullMQRunner (local sandboxed worker) and WorkerServer (standalone/remote worker)
// point at this same BullMQ queue name — kept here so a third consumer (SubmitDetachedJob)
// can't introduce yet another copy for these to drift against.
export const JOB_QUEUE_NAME = 'tipeline-tasks';

export interface JobPayload {
  type: 'exec' | 'run' | 'resume';
  /**
   * Unique identifier for this job instance. For scheduled (cron) jobs, this is generated
   * as `cron-<scheduleId>-<timestamp>` rather than being provided by the caller.
   */
  correlationId: string;
  identifier?: string;
  variables?: Record<string, any>;
  payload?: any;
  pipelineIdentifier?: string;
  stepMode?: boolean;
  debugMode?: boolean;
  /** Debugger runs: identifiers of the steps to pause before. */
  breakpoints?: string[];
  /**
   * Nested-subtask call stack, propagated so a subtask.exec(async: true) job still
   * participates in circular-subtask detection (see Task.getCallStack/setCallStack).
   */
  callStack?: string[];
  /**
   * Whether this job's pipeline should persist to the database. Defaults to true when
   * omitted, matching every existing call site's current hardcoded behavior — only an
   * async subtask.exec job sets this explicitly, to inherit its parent's shouldSave.
   */
  shouldSave?: boolean;
  /**
   * Run with no database persistence at all (no pipeline record, via runClean) — used
   * for an App's `persist: false` runnables, i.e. read-only lookups that shouldn't fill
   * the workflow's history. Distinct from `shouldSave: false`, which still creates the
   * pipeline record (see subtask.exec's documented persistence behavior).
   */
  ephemeral?: boolean;
  /**
   * Workflow variables whose final values the caller wants back. They are attached to
   * the top-level `taskEnd` event as `outputs` (private and secret variables excluded).
   */
  outputs?: string[];
  /** Who started the run, when not a person running the workflow directly — stored on the pipeline. */
  trigger?: RunTrigger;
  /** The run and step that started this one: an async subtask.exec — stored on the pipeline. */
  parent?: ParentRun;
  /**
   * How the run uses the result cache (packages/schemas/src/cache.ts): omitted = 'use';
   * 'bypass' runs every step without reading or writing it; 'refresh' runs every step
   * and replaces what's stored.
   */
  cacheMode?: CacheMode;
  /**
   * Set when someone started the run directly (Desktop builder or Overview, CLI
   * `task exec`). Only then may a draft workflow run; see task/Draft.ts.
   */
  allowDraft?: boolean;
}

/** Recorded on a pipeline's metadata as `trigger` (shown in run history). */
export interface RunTrigger {
  type: 'app';
  appIdentifier: string;
  appName: string;
  pageId: string;
  runnable: string;
}

/**
 * Recorded on a sub-workflow run's metadata as `parent`: the run and step that started
 * it, so the run page can link both ways. Names are kept so the link reads well even
 * after the parent workflow is renamed or deleted.
 */
export interface ParentRun {
  pipelineIdentifier: string;
  taskIdentifier: string;
  taskName: string;
  stepIdentifier: string;
}

/** A schedule has exactly one of: a cron, an interval (everySeconds), or a runAt (runs once). */
export interface ScheduleOptions {
  cron?: string | null;
  /** ISO time to run once. */
  runAt?: string | null;
  /** Repeats every this many seconds, counted from when it's turned on. */
  everySeconds?: number | null;
  variables?: Record<string, any>;
}

export interface ScheduleEntry {
  scheduleIdentifier: string;
  taskIdentifier: string;
  taskName: string;
  /** Null for a one-time schedule. */
  cron: string | null;
  /** ISO time a one-time schedule runs; null for a repeating one. */
  runAt: string | null;
  /** The interval of an interval schedule, in seconds; null otherwise. */
  everySeconds: number | null;
  variables: Record<string, any>;
  enabled: boolean;
  /** ISO time of the next run; null when paused, done, or the cron can't be read. */
  nextRunAt: string | null;
  /** ISO time it last started a run. */
  lastRunAt: string | null;
}

export interface IJobRunner {
  submit(job: JobPayload): Promise<void>;
  scheduleTask(taskIdentifier: string, options: ScheduleOptions): Promise<string>;
  removeSchedule(scheduleIdentifier: string): Promise<void>;
  toggleSchedule(scheduleIdentifier: string, enabled: boolean): Promise<void>;
  listSchedules(): Promise<ScheduleEntry[]>;
  start(): Promise<void>;
  /** Waits for running jobs to end, unless `interrupt` says to end them. */
  stop(options?: { interrupt?: boolean }): Promise<void>;
  /**
   * Jobs running right now, including ones that leave no run record. Runners that can't tell
   * leave this out, and the run records are counted instead.
   */
  activeJobs?(): number;
  setBroadcast?(fn: (event: string, data: any) => void): void;
  /**
   * Asks a running job to stop at its next step. False when no such job is running.
   * Runners that can't reach their jobs (BullMQ, for now) don't implement it.
   */
  cancel?(correlationId: string, canceledBy: string): boolean;
  /** The running job that started this run (or a sync sub-workflow of it), if any. */
  findJob?(pipelineIdentifier: string): string | null;
  /**
   * Re-registers all enabled cron schedules from scratch. Used to recover from
   * system sleep/wake, where a long-suspended process can leave scheduled timers
   * unable to re-arm themselves.
   */
  resync?(): Promise<void>;
}

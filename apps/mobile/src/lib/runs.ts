import { parseSource, resultVariables, stepsFromSource, type WorkflowVariable } from './workflows';

/** Run statuses as Core stores them. `paused`: waiting at an approval (or a debugger). */
export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';

/** One row of `pipelineList`. */
export interface RunRow {
  identifier: string;
  status: RunStatus | string;
  started_at: string | null;
  finished_at: string | null;
  metadata?: unknown;
  task_name?: string;
  task_identifier?: string;
}

/** A pending approval in a run's metadata. */
export interface RunApproval {
  title?: string;
  details?: string | null;
  requestedAt?: string;
}

/** `pipelineDetail`: the run, its steps, its own copy of the source and its final values. */
export interface RunDetail {
  identifier: string;
  status: RunStatus | string;
  started_at: string | null;
  finished_at: string | null;
  metadata?: unknown;
  source?: string | null;
  task?: { identifier: string; name: string } | null;
  actions?: Array<{
    identifier: string;
    status: string;
    error?: unknown;
    started_at?: string | null;
    finished_at?: string | null;
    block?: { parent_block_id?: number | null } | null;
  }>;
  variables?: Array<{ name: string; value: unknown; scope?: string; hidden?: boolean }>;
}

/** Filters on the Runs list; each maps to Core's status filter. */
export const RUN_FILTERS = ['all', 'running', 'paused', 'failed'] as const;
export type RunFilter = (typeof RUN_FILTERS)[number];

export const statusFilter = (filter: RunFilter): string | undefined => (filter === 'all' ? undefined : filter);

/** Still going: it may change, so screens follow it. */
export const isActive = (status: string): boolean =>
  status === 'pending' || status === 'running' || status === 'paused';

/** The pill style for a status. */
export function statusTone(status: string): 'success' | 'failed' | 'waiting' | 'muted' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'failed';
  if (isActive(status)) return 'waiting';
  return 'muted';
}

const parse = (value: unknown): any => {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/** The approval a paused run waits at, if any. */
export function pendingApproval(run: Pick<RunDetail, 'status' | 'metadata'>): RunApproval | null {
  if (run.status !== 'paused') return null;
  const approval = parse(run.metadata)?.approval;
  return approval && typeof approval === 'object' ? approval : null;
}

/** Why a run ended as it did, in Core's words ("Canceled by ed@acme.com", a rejection). */
export function endMessage(run: Pick<RunDetail, 'status' | 'metadata'>): string {
  if (isActive(run.status)) return '';
  const message = parse(run.metadata)?.message;
  return typeof message === 'string' ? message : '';
}

export type RunStepState = 'done' | 'failed' | 'running' | 'paused' | 'canceled' | 'waiting' | 'skipped';

export interface RunStep {
  identifier: string;
  label: string;
  state: RunStepState;
  error?: string;
  durationMs?: number;
}

const errorText = (error: unknown): string => {
  if (!error) return '';
  const parsed = parse(error);
  if (typeof parsed === 'string') return parsed;
  if (parsed && typeof parsed.message === 'string') return parsed.message;
  return typeof error === 'string' ? error : JSON.stringify(error);
};

const STEP_STATES: Record<string, RunStepState> = {
  completed: 'done',
  failed: 'failed',
  running: 'running',
  paused: 'paused',
  canceled: 'canceled',
};

/**
 * The run's top-level steps in source order, each with what happened to it. Steps inside
 * blocks and loops aren't listed (Desktop's run page has them). A step with no row, or a
 * `pending` one, didn't run: still to come while the run goes on, skipped once it ended.
 */
export function runSteps(run: RunDetail): RunStep[] {
  const source = parseSource(run.source);
  const rows = new Map<string, NonNullable<RunDetail['actions']>[number]>();
  for (const row of run.actions ?? []) {
    if (row.block && row.block.parent_block_id != null) continue;
    rows.set(row.identifier, row); // in execution order: the last attempt wins
  }
  const active = isActive(run.status);
  return stepsFromSource(source).map((step) => {
    const row = rows.get(step.identifier);
    if (!row) return { ...step, state: active ? 'waiting' : 'skipped' };
    // Core stores a `pending` row for steps still to come: once the run ended, they never ran.
    const state = STEP_STATES[row.status] ?? (active ? 'waiting' : 'skipped');
    const took = row.started_at && row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.started_at) : NaN;
    return {
      ...step,
      state,
      ...(state === 'failed' && errorText(row.error) ? { error: errorText(row.error) } : {}),
      ...(Number.isFinite(took) && took >= 0 ? { durationMs: took } : {}),
    };
  });
}

export interface RunOutput {
  variable: WorkflowVariable;
  value: unknown;
  /** Core keeps the value to itself (a secret, or from the environment). */
  hidden: boolean;
}

/**
 * What a run returned, by the workflow page's rule (public outputs, else public non-secret
 * variables), read from the run's own copy of the workflow: a later edit doesn't change it.
 */
export function runOutputs(run: RunDetail): RunOutput[] {
  const values = new Map<string, { value: unknown; hidden: boolean }>();
  for (const v of run.variables ?? []) {
    if (!v || typeof v.name !== 'string' || (v.scope && v.scope !== 'task')) continue;
    values.set(v.name, { value: v.value, hidden: !!v.hidden });
  }
  return resultVariables(parseSource(run.source))
    .filter((variable) => values.has(variable.name))
    .map((variable) => {
      const found = values.get(variable.name)!;
      return { variable, value: found.value, hidden: found.hidden || !!variable.secret };
    });
}

/** How long a run took, or has taken so far. */
export function runDurationMs(run: Pick<RunRow, 'started_at' | 'finished_at'>, now = Date.now()): number | undefined {
  if (!run.started_at) return undefined;
  const end = run.finished_at ? Date.parse(run.finished_at) : now;
  const ms = end - Date.parse(run.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/** "5 minutes ago", "in 2 hours", "now" — in the app's language. */
export function relativeTime(iso: string | null | undefined, locale: string, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const diff = at - now;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return format.format(Math.round(diff / size), unit);
  }
  return format.format(0, 'second');
}

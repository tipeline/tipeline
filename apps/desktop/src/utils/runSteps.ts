// Shared logic for a run's steps (the Steps list and the Timing chart on the run page).
// Works on the enriched action tree built by usePipelineResult / updateTimelineWithEvents:
// nested steps live in `params.actions`, a loop body's passes in `iterations`, and the
// steps of the run a sub-workflow step started in `childSteps` (see childRuns.ts).
import { safeStringify } from '@/utils/truncateValue';

// 'skipped': a disabled step, listed by the debugger so its list matches the workflow.
export type StepStatus = 'completed' | 'failed' | 'running' | 'pending' | 'cached' | 'skipped';

/** A step at least this long counts as slow (the "Over 1s" filter, bold durations). */
export const SLOW_STEP_MS = 1000;

export interface StepRow {
  action: any;
  key: string;
  depth: number;
  hasChildren: boolean;
}

export function stepKey(action: any, path: string): string {
  return action.identifier || path;
}

export function stepChildren(action: any): any[] {
  const children = action?.params?.actions;
  if (Array.isArray(children)) return children;
  return Array.isArray(action?.childSteps) ? action.childSteps : [];
}

/** A step that runs another workflow (subtask.exec). */
export function isSubWorkflowStep(action: any): boolean {
  return action?.group === 'subtask' && action?.name === 'exec';
}

export function stepStatus(action: any): StepStatus {
  if (action.status === 'failed' || (!action.status && action.error)) return 'failed';
  if (action.status === 'running') return 'running';
  if (action.status === 'skipped') return 'skipped';
  if (action.status === 'completed') return action.cached ? 'cached' : 'completed';
  return 'pending';
}

export function stepLabel(action: any): string {
  return action.group ? `${action.group}.${action.name}` : action.name;
}

const time = (value: unknown): number | null => {
  if (!value) return null;
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** Start and end in ms. A running step ends at `now`; a step without a start has no span. */
export function stepSpan(action: any, now: number | null): { start: number; end: number } | null {
  const start = time(action.started_at);
  if (start === null) return null;
  const end = time(action.finished_at) ?? (action.status === 'running' && now !== null ? now : null);
  if (end === null) return null;
  return { start, end: Math.max(end, start) };
}

export function stepDuration(action: any, now: number | null): number | null {
  const span = stepSpan(action, now);
  return span ? span.end - span.start : null;
}

/** One pass of a loop body, with its own span when both times were saved. */
export interface IterationSpan {
  index: number;
  status: string;
  start: number | null;
  end: number | null;
  duration: number | null;
  slow: boolean;
}

/**
 * The passes of a loop body step. A pass is slow when it took over twice the median pass
 * (and at least 100ms), so the one that stands out is marked, not every pass of a slow loop.
 */
export function iterationSpans(action: any): IterationSpan[] {
  const iterations: any[] = Array.isArray(action.iterations) ? action.iterations : [];
  const spans = iterations.map((it, i) => {
    const start = time(it.started_at);
    const end = time(it.finished_at);
    const duration = start !== null && end !== null ? Math.max(0, end - start) : null;
    return { index: it.index ?? i + 1, status: it.status, start, end, duration, slow: false };
  });
  const durations = spans.map((s) => s.duration).filter((d): d is number => d !== null).sort((a, b) => a - b);
  if (durations.length > 2) {
    const median = durations[Math.floor(durations.length / 2)];
    for (const s of spans) {
      if (s.duration !== null && s.duration >= 100 && s.duration > median * 2) s.slow = true;
    }
  }
  return spans;
}

export function averageIteration(action: any): number | null {
  const durations = iterationSpans(action)
    .map((s) => s.duration)
    .filter((d): d is number => d !== null);
  if (!durations.length) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

export function hasIterations(action: any): boolean {
  return Array.isArray(action.iterations) && action.iterations.length > 1;
}

/**
 * Every step, depth first, with its depth. `open` decides whose children are listed. A
 * sub-workflow's steps are keyed under the step that ran them (`step>child`): they come
 * from another workflow, so their identifiers can repeat the caller's.
 */
export function flattenSteps(
  actions: any[],
  open: (key: string, action: any) => boolean = () => true
): StepRow[] {
  const rows: StepRow[] = [];
  const walk = (list: any[], depth: number, path: string, scope: string) => {
    list.forEach((action, i) => {
      const key = scope + stepKey(action, `${path}${i}`);
      const children = stepChildren(action);
      rows.push({ action, key, depth, hasChildren: children.length > 0 });
      if (!children.length || !open(key, action)) return;
      if (children === action.childSteps) walk(children, depth + 1, '', `${key}>`);
      else walk(children, depth + 1, `${key}/`, scope);
    });
  };
  walk(actions ?? [], 0, '', '');
  return rows;
}

export interface StepCounts {
  total: number;
  completed: number;
  cached: number;
  failed: number;
  running: number;
  pending: number;
  skipped: number;
  slow: number;
}

/** Counts over every step, nested ones included, but not a sub-workflow's (they're its run's). */
export function countSteps(actions: any[], now: number | null): StepCounts {
  const counts: StepCounts = { total: 0, completed: 0, cached: 0, failed: 0, running: 0, pending: 0, skipped: 0, slow: 0 };
  for (const { action } of flattenSteps(actions, (_key, step) => !step.childSteps)) {
    counts.total++;
    counts[stepStatus(action)]++;
    if (isSlowStep(action, now)) counts.slow++;
  }
  return counts;
}

export function isSlowStep(action: any, now: number | null): boolean {
  return (stepDuration(action, now) ?? 0) >= SLOW_STEP_MS;
}

/** First failed step, depth first (the deepest one is the one that threw). */
export function firstFailed(actions: any[]): StepRow | null {
  const failed = flattenSteps(actions).filter((r) => stepStatus(r.action) === 'failed');
  return failed.length ? failed[failed.length - 1] : null;
}

/**
 * The run's time window: from the run's start (or its first step) to its end, the
 * current time while it's live, or its last finished step.
 */
export function runWindow(
  actions: any[],
  pipeline: { started_at?: string | null; finished_at?: string | null } | null | undefined,
  now: number | null
): { start: number; end: number } | null {
  const spans = flattenSteps(actions)
    .flatMap(({ action }) => {
      const own = stepSpan(action, now);
      const passes = iterationSpans(action)
        .filter((s) => s.start !== null && s.end !== null)
        .map((s) => ({ start: s.start!, end: s.end! }));
      return own ? [own, ...passes] : passes;
    });
  // The run's own times are saved apart from the steps' (and can be a little off), so the
  // window always stretches to cover every step; else a bar runs past the end of its track.
  const firstStep = spans.length ? Math.min(...spans.map((s) => s.start)) : null;
  const runStart = time(pipeline?.started_at);
  const start = runStart !== null && firstStep !== null ? Math.min(runStart, firstStep) : (runStart ?? firstStep);
  if (start === null) return null;
  const lastStep = spans.length ? Math.max(...spans.map((s) => s.end)) : start;
  const end = Math.max(time(pipeline?.finished_at) ?? (now !== null ? now : lastStep), lastStep);
  return { start, end: Math.max(end, start + 1) };
}

/** 4ms, 1.2s, 2m 5s — steps are often well under a second, so this keeps the ms. */
export function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

export function formatClock(ms: number, withMs = false): string {
  const d = new Date(ms);
  const base = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return withMs ? `${base}.${String(d.getMilliseconds()).padStart(3, '0')}` : base;
}

/** The step's input on one line, for the row: its first few values, not its keys. */
export function stepSummary(action: any, max = 90): string {
  const params = action?.params;
  if (!params || typeof params !== 'object') return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (key === 'actions' || value === null || value === undefined || value === '') continue;
    const text = typeof value === 'object' ? safeStringify(value) : String(value);
    parts.push(text.replace(/\s+/g, ' '));
    if (parts.join(' · ').length > max || parts.length >= 3) break;
  }
  const line = parts.join(' · ');
  return line.length > max ? line.slice(0, max) + '…' : line;
}

/** A count with its noun, for result summaries: "1 item", "18 items". */
const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/**
 * An output in a few words, for the debugger's Result column: "200 · 18 items",
 * "3 items", "changes: 1", or the start of a text. Empty when there's nothing to say.
 */
export function resultSummary(result: unknown, max = 40): string {
  if (result === null || result === undefined || result === '') return '';
  if (Array.isArray(result)) return items(result.length);
  if (typeof result === 'object') {
    const value = result as Record<string, unknown>;
    // An HTTP response: its status and what came back.
    if (typeof value.status === 'number' && 'data' in value) {
      const data = value.data;
      const rest = Array.isArray(data) ? items(data.length) : resultSummary(data, max - 6);
      return rest ? `${value.status} · ${rest}` : String(value.status);
    }
    const keys = Object.keys(value);
    if (keys.length === 1) return `${keys[0]}: ${resultSummary(value[keys[0]], max)}`;
    return `${keys.length} keys`;
  }
  const text = String(result).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** How many passes a loop or branch has made so far: the most any step inside it ran. */
export function passCount(action: any): number {
  return Math.max(
    0,
    ...stepChildren(action).map((child) =>
      Array.isArray(child.iterations) && child.iterations.length > 1
        ? child.iterations.length
        : stepStatus(child) === 'pending' || stepStatus(child) === 'skipped'
          ? 0
          : 1
    )
  );
}

export interface StepResult {
  /** Shown as is (an output summary), or… */
  text?: string;
  /** …a message under `runDetail.result.*`, with its count. */
  key?: 'failed' | 'failedOnPass' | 'pass' | 'passes' | 'notRun';
  count?: number;
  tone: 'done' | 'active' | 'failed' | 'muted';
}

/**
 * What a step did, for its row in the debugger: its output in a few words, how far a
 * loop has got, or that it failed or never ran. Null when there's nothing to show.
 */
export function stepResult(action: any, ended: boolean): StepResult | null {
  const status = stepStatus(action);
  const container = stepChildren(action).length > 0;
  const passes = container ? passCount(action) : 0;
  if (status === 'failed') {
    const failedPass = container ? passes : (action.iterations?.length ?? 0);
    return failedPass > 1
      ? { key: 'failedOnPass', count: failedPass, tone: 'failed' }
      : { key: 'failed', tone: 'failed' };
  }
  if (status === 'running') return passes ? { key: 'pass', count: passes, tone: 'active' } : null;
  if (status === 'pending') return ended && !action.next ? { key: 'notRun', tone: 'muted' } : null;
  if (status === 'skipped') return null;
  if (hasIterations(action)) {
    const last = resultSummary(action.result);
    return { text: `${last ? `${last} · ` : ''}×${action.iterations.length}`, tone: 'done' };
  }
  const text = resultSummary(action.result);
  if (text) return { text, tone: 'done' };
  return passes > 1 ? { key: 'passes', count: passes, tone: 'done' } : null;
}

/** Round axis steps for a span: 1, 2, 5 × 10ⁿ ms, about `target` ticks across. */
export function axisTicks(span: number, target = 8): number[] {
  if (span <= 0) return [0];
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const ticks: number[] = [];
  for (let t = 0; t <= span + 1e-9; t += step) ticks.push(t);
  return ticks;
}

export function formatTick(ms: number, span: number): string {
  if (span < 2000) return `${Math.round(ms)}ms`;
  if (span < 120000) return `${+(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

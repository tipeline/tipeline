import * as os from 'os';
import { CORE_VERSION } from '@utils/coreVersion';

/**
 * What started a run, as `{{ _run.trigger }}` reads it:
 * - manual: someone ran it (Desktop, CLI, or a signed-in Server user)
 * - schedule: a schedule
 * - app: an app's runnable
 * - workflow: another workflow, as a sub-workflow
 * - webhook: a Server webhook
 * - mcp: a program over MCP (the Assistant included)
 */
export type RunTriggerKind = 'manual' | 'schedule' | 'app' | 'workflow' | 'webhook' | 'mcp';

export const RUN_TRIGGER_KINDS: readonly RunTriggerKind[] = [
  'manual',
  'schedule',
  'app',
  'workflow',
  'webhook',
  'mcp',
];

/** Who or what started a run, carried on the job and kept on the run's metadata (for resumes). */
export interface StartedBy {
  trigger?: RunTriggerKind;
  /** The signed-in Server user's email, when one started it. */
  user?: string;
}

/** A StartedBy from untrusted input (an IPC payload): unknown triggers and non-strings dropped. */
export function toStartedBy(value: unknown): StartedBy | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { trigger, user } = value as Record<string, unknown>;
  const result: StartedBy = {};
  if (typeof trigger === 'string' && (RUN_TRIGGER_KINDS as string[]).includes(trigger)) {
    result.trigger = trigger as RunTriggerKind;
  }
  if (typeof user === 'string' && user.trim()) result.user = user.trim().slice(0, 320);
  return result.trigger || result.user ? result : undefined;
}

export interface CoreInfo {
  /** TIPELINE_CORE_NAME, or the hostname: tells workers apart in a queue. */
  id: string;
  host: string;
  platform: 'mac' | 'linux' | 'windows' | string;
  version: string;
}

let cachedCore: CoreInfo | null = null;

/** `_core`: the Core process running this step — a remote worker's own, not the one that queued it. */
export function coreInfo(): CoreInfo {
  if (cachedCore) return cachedCore;
  const host = os.hostname();
  const platform =
    process.platform === 'darwin' ? 'mac'
    : process.platform === 'win32' ? 'windows'
    : process.platform;
  cachedCore = {
    id: process.env.TIPELINE_CORE_NAME?.trim() || host,
    host,
    platform,
    version: CORE_VERSION,
  };
  return cachedCore;
}

export interface RunInfo {
  /** The run's identifier (empty for a run that isn't saved, like an app lookup). */
  id: string;
  workflow: string;
  workflowName: string;
  trigger: RunTriggerKind;
  /** The signed-in Server user who started it; empty otherwise. */
  user: string;
  /** The run that started this one, for a sub-workflow; empty otherwise. */
  parentId: string;
  startedAt: string;
}

/** The parts of a Task that runInfo reads (kept narrow so tests and previews can pass their own). */
export interface RunInfoSource {
  getIdentifier(): string;
  getName(): string;
  getTrigger(): Record<string, unknown> | null;
  getParentRun(): { pipelineIdentifier: string } | null;
  getStartedBy(): StartedBy | null;
  getStartedAt(): string;
  getPipeline(): { getIdentifier(): string };
}

/** `_run`: this run, as its steps see it. */
export function runInfo(task: RunInfoSource): RunInfo {
  const startedBy = task.getStartedBy();
  const parent = task.getParentRun();
  const trigger: RunTriggerKind =
    parent ? 'workflow'
    : task.getTrigger()?.type === 'app' ? 'app'
    : (startedBy?.trigger ?? 'manual');
  return {
    id: task.getPipeline().getIdentifier() ?? '',
    workflow: task.getIdentifier(),
    workflowName: task.getName(),
    trigger,
    user: startedBy?.user ?? '',
    parentId: parent?.pipelineIdentifier ?? '',
    startedAt: task.getStartedAt(),
  };
}

/** What `_run` and `_core` resolve to while params are rendered. */
export interface RunContext {
  run: RunInfo;
  core: CoreInfo;
}

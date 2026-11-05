/**
 * A draft is a workflow the assistant wrote that nobody has checked yet. It's
 * stored as `metadata.draft` on the task row, so no migration is needed. A draft
 * runs only when someone starts it directly (the Desktop builder or Overview,
 * `tipeline task exec`); the assistant, schedules, apps and sub-workflow steps
 * refuse it until it's marked ready.
 */

function readMetadata(record: { metadata?: unknown } | null | undefined): Record<string, any> {
  const raw = record?.metadata;
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * A schedule the assistant proposed with a draft ("every day at 9am"), stored as
 * `metadata.draftSchedule` and checked when the draft was saved. Nothing runs from it
 * until someone marks the draft ready and chooses to turn the schedule on.
 */
export interface DraftSchedule {
  /** The words the assistant used, e.g. "every day at 9am". */
  when: string;
  cron: string | null;
  runAt: string | null;
  everySeconds?: number | null;
}

/**
 * True when a workflow repeats itself on a timer: a flow.wait step inside a loop.
 * With a schedule that's the schedule's job, so a draft that does both runs twice over.
 */
export function repeatsOnATimer(workflow: unknown): boolean {
  const visit = (steps: unknown, inLoop: boolean): boolean =>
    Array.isArray(steps) &&
    steps.some((step: any) => {
      if (!step || typeof step !== 'object') return false;
      if (inLoop && step.group === 'flow' && step.name === 'wait') return true;
      const loop = inLoop || (step.group === 'flow' && /Loop$/.test(String(step.name)));
      return visit(step.actions, loop) || visit(step.params?.actions, loop);
    });
  return visit((workflow as any)?.pipeline?.actions, false);
}

export function readDraftSchedule(record: { metadata?: unknown } | null | undefined): DraftSchedule | null {
  const value = readMetadata(record).draftSchedule;
  return value && typeof value === 'object' && (value.cron || value.runAt || value.everySeconds)
    ? (value as DraftSchedule)
    : null;
}

export function isDraft(record: { metadata?: unknown } | null | undefined): boolean {
  return readMetadata(record).draft === true;
}

export class DraftWorkflowError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is a draft. Open it in the builder, test it and mark it ready before it can run from here.`
    );
    this.name = 'DraftWorkflowError';
  }
}

/** Throws DraftWorkflowError for a draft, unless the run was started directly by someone. */
export function assertNotDraft(
  record: { metadata?: unknown; name?: string; identifier?: string } | null | undefined,
  allowDraft = false
) {
  if (!allowDraft && isDraft(record)) throw new DraftWorkflowError(record?.name ?? record?.identifier ?? 'This workflow');
}

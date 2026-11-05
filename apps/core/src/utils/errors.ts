export class TaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class YAMLParsingError extends TaskError {}
export class ValidationFormatError extends TaskError {}
export class ActionExecutionError extends TaskError {}
export class TaskLoadError extends TaskError {}

/**
 * Thrown by `approval.request` while no decision exists yet. Not a failure: the run
 * stops as "paused" (see Block / Pipeline) and continues from the same step when an
 * approver decides — the step then returns the decision.
 */
export class ApprovalPendingSignal extends Error {
  constructor(public readonly title: string) {
    super(`Waiting for approval: ${title}`);
    this.name = 'ApprovalPendingSignal';
  }
}

/**
 * Thrown by `approval.request` when the decision is a rejection and the step says
 * `onReject: stop` (the default). Not a failure either: the step and the run end as
 * "canceled" (see Block / Pipeline), recording who rejected it and why.
 */
export class ApprovalRejectedSignal extends Error {
  constructor(
    public readonly title: string,
    public readonly decidedBy: string,
    public readonly comment: string
  ) {
    super(`Rejected${decidedBy === 'timeout' ? ' automatically (no decision in time)' : ` by ${decidedBy}`}${comment ? `: ${comment}` : ''}`);
    this.name = 'ApprovalRejectedSignal';
  }
}

/**
 * Thrown once someone canceled the run (or pressed Stop while debugging), ending the
 * step that was running. Not a failure: the step and the run end as "canceled" (see Block /
 * Pipeline), recording who canceled it.
 */
export class RunCanceledSignal extends Error {
  constructor(public readonly canceledBy: string) {
    super(canceledBy ? `Canceled by ${canceledBy}` : 'Canceled');
    this.name = 'RunCanceledSignal';
  }
}

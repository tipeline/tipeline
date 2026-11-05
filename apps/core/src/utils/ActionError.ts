import type { ActionErrorData, ActionErrorIssue } from '@tipeline/types';

export class ActionError extends Error {
  readonly group: string;
  readonly action: string;
  readonly issues: ActionErrorIssue[];

  constructor(group: string, action: string, message: string, issues: ActionErrorIssue[] = []) {
    super(message);
    this.name = 'ActionError';
    this.group = group;
    this.action = action;
    this.issues = issues;
  }

  toData(): ActionErrorData {
    return {
      __type: 'ActionError',
      group: this.group,
      action: this.action,
      message: this.message,
      issues: this.issues,
    };
  }

  static fromCaught(group: string, action: string, error: any): ActionError {
    // Pass through ActionError from nested calls (e.g. subtasks)
    if (error instanceof ActionError) return error;

    // Duck-type ZodError — avoids instanceof failures when multiple
    // module instances of zod exist across workspace packages.
    if (Array.isArray(error?.issues)) {
      const issues: ActionErrorIssue[] = error.issues.map((issue: any) => ({
        path: Array.isArray(issue.path) ? issue.path.join('.') : String(issue.path ?? ''),
        message: issue.message ?? 'Validation error',
        code: issue.code,
      }));
      const message = issues
        .map((i) => (i.path ? `${i.message} — ${i.path}` : i.message))
        .join('; ');
      return new ActionError(group, action, message, issues);
    }

    return new ActionError(group, action, error?.message ?? String(error));
  }
}

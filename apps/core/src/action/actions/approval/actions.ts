import { parseApprovalTimeout, validations } from '@tipeline/schemas';
import { PipelineService } from '@database/services/PipelineService';
import { ApprovalPendingSignal, ApprovalRejectedSignal } from '@utils/errors';
import type { Task } from '@task/Task';
import type { Action } from '@action/Action';

export interface ApprovalDecision {
  approved: boolean;
  comment: string;
  decidedAt: string;
  decidedBy: string;
}

/**
 * @group Actions
 */
export class GroupApproval {
  // --------------------------------------------------
  // Request
  // --------------------------------------------------

  /**
   * Pauses the run until someone approves or rejects it — from the Approvals page, the
   * workflow's run history or an app's Approvals component. Once decided the run resumes
   * (completed steps are skipped). Approved: this step returns the decision. Rejected: the
   * run ends as canceled — or, with `onReject: continue`, the step returns the decision
   * for the workflow to handle (check `decision.approved`). With a `timeout`
   * (e.g. `48h`) nobody deciding in time decides automatically — rejected unless
   * `onTimeout: approve` — with `decidedBy: timeout`. On a server workspace, `approvers`
   * (roles and/or emails) limits who may decide, and `allowSelfApproval: false` keeps the
   * person who started the run from deciding it. Inside a loop each iteration is its
   * own request. Needs run history, so it fails in runs that aren't saved.
   *
   * @param params - The input parameters.
   * @returns The decision: `{ approved, comment, decidedBy, decidedAt }`.
   * @example
   * ```yaml
   * # Ask before paying, then only pay when approved
   * - group: approval
   *   name: request
   *   params:
   *     title: 'Pay invoice {{ invoiceNumber }}?'
   *     details: '{{ amount }} to {{ supplier }}'
   *     timeout: 48h
   *     approvers: [admin, finance@acme.com]
   *     allowSelfApproval: false
   *   destination: decision
   * - group: flow
   *   name: ifConditional
   *   params:
   *     firstOperand: '{{ decision.approved }}'
   *     compareAs: boolean
   *     operator: isTrue
   *     actions:
   *       - group: system
   *         name: message
   *         params:
   *           text: Approved by {{ decision.decidedBy }}
   * ```
   */
  static async request(
    params: unknown,
    task: Task,
    _lastResult: unknown,
    action: Action
  ): Promise<ApprovalDecision> {
    const parsed = validations.approval.request.runtime.validate(params);
    const pipeline = task.getPipeline();
    if (!task.getShouldSave() || !pipeline.getId()) {
      throw new Error(
        "approval.request needs run history to wait for a decision — it can't be used in a run that isn't saved (a file run, or an app runnable with persist: false)."
      );
    }

    if (task.isAwaitedByParent()) {
      throw new Error(
        "approval.request can't wait inside a sub-workflow its parent waits for — put the approval in the parent workflow, or start this one with async: true."
      );
    }

    const [blockId] = pipeline.getCurrentContext();
    const key = `${blockId}:${action.identifier}`;
    const record = await PipelineService.getById(pipeline.getId());
    const decision = (record?.metadata as any)?.approvals?.[key] as ApprovalDecision | undefined;
    if (decision) {
      // A rejection stops the run unless the workflow handles it itself.
      if (!decision.approved && (parsed.onReject ?? 'stop') === 'stop') {
        throw new ApprovalRejectedSignal(parsed.title, decision.decidedBy, decision.comment);
      }
      return decision;
    }

    const requestedAt = new Date();
    const timeoutMs = parsed.timeout ? parseApprovalTimeout(parsed.timeout) : null;
    await PipelineService.mergeMetadata(pipeline.getId(), {
      approval: {
        key,
        actionIdentifier: action.identifier,
        title: parsed.title,
        details: parsed.details ?? null,
        requestedAt: requestedAt.toISOString(),
        // Enforced by the server gateway (local Tipeline has no users).
        ...(parsed.approvers?.length ? { approvers: parsed.approvers } : {}),
        ...(parsed.allowSelfApproval === false ? { allowSelfApproval: false } : {}),
        // Decided automatically after this (see ApprovalTimeoutService).
        ...(timeoutMs
          ? {
              timeout: parsed.timeout!.trim(),
              onTimeout: parsed.onTimeout ?? 'reject',
              expiresAt: new Date(requestedAt.getTime() + timeoutMs).toISOString(),
            }
          : {}),
      },
    });
    throw new ApprovalPendingSignal(parsed.title);
  }
}

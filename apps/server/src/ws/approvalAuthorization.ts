// Who may see and decide approvals (runs paused at an approval.request) through the
// server. Core lists and decides approvals for anyone who asks; on a server the gateway
// decides who that is:
//
//  - Seeing: the same rule as other workflow reads — a private workflow owned by someone
//    else is hidden (admins see everything).
//  - Deciding, when the request names `approvers` (roles and/or emails): admins always;
//    a listed email (even a viewer — e.g. a manager who only approves); a listed role
//    and every role above it.
//  - Deciding, when it names none: anyone who can run the workflow (editor or admin).
//  - With `allowSelfApproval: false` (four-eyes rule), never the person who started the
//    run — not even an admin, or the rule would mean nothing for them.
//
// The decision is recorded under the signed-in user's email, never a name the client
// sends.

import { isRole, roleRank } from '../auth/Permissions.js';

export interface ApprovalUser {
  id: string;
  email: string;
  role: string;
}

export interface PendingApprovalItem {
  pipelineIdentifier: string;
  taskIdentifier: string;
  approvers?: string[] | null;
  /** false: the person who started the run may not decide it. */
  allowSelfApproval?: boolean;
  [key: string]: unknown;
}

export interface Requester {
  id: string;
  email: string;
}

export interface ApprovalAuthDeps {
  getOwner(taskIdentifier: string): Promise<{ user_id: string; visibility: string } | null>;
  /** Who started the run, when a signed-in user did (not webhooks or schedules). */
  getRequester(pipelineIdentifier: string): Promise<Requester | null>;
}

/** Why a user may not decide, or null when they may. */
export type DecideBlock = 'approvers' | 'requester' | null;

export function decideBlock(
  user: ApprovalUser,
  item: Pick<PendingApprovalItem, 'approvers' | 'allowSelfApproval'>,
  requester: Requester | null
): DecideBlock {
  if (item.allowSelfApproval === false && requester && requester.id === user.id) return 'requester';
  return canDecide(user, item.approvers) ? null : 'approvers';
}

export function canDecide(user: ApprovalUser, approvers: string[] | null | undefined): boolean {
  if (user.role === 'admin') return true;
  if (!approvers?.length) return roleRank(user.role) >= roleRank('editor');
  const email = user.email.toLowerCase();
  return approvers.some((entry) => {
    const value = entry.trim().toLowerCase();
    if (isRole(value)) return roleRank(user.role) >= roleRank(value);
    return value === email;
  });
}

async function isHidden(
  item: PendingApprovalItem,
  user: ApprovalUser,
  deps: ApprovalAuthDeps
): Promise<boolean> {
  if (user.role === 'admin') return false;
  const owner = await deps.getOwner(item.taskIdentifier);
  return !!owner && owner.user_id !== user.id && owner.visibility === 'private';
}

export type VisibleApproval<T> = T & {
  canDecide: boolean;
  /** Why not, when canDecide is false: not an approver, or started the run themselves. */
  blockedBy: DecideBlock;
  /** Email of who started the run, when a signed-in user did. */
  requestedBy: string | null;
};

/** The approvals this user may see, each marked with whether they may decide it. */
export async function visibleApprovals<T extends PendingApprovalItem>(
  items: T[],
  user: ApprovalUser,
  deps: ApprovalAuthDeps
): Promise<VisibleApproval<T>[]> {
  const out: VisibleApproval<T>[] = [];
  for (const item of items) {
    if (await isHidden(item, user, deps)) continue;
    const requester = await deps.getRequester(item.pipelineIdentifier);
    const blockedBy = decideBlock(user, item, requester);
    out.push({
      ...item,
      canDecide: blockedBy === null,
      blockedBy,
      requestedBy: requester?.email ?? null,
    });
  }
  return out;
}

/** Past decisions this user may see: the same visibility rule as pending ones. */
export async function visibleHistory<
  T extends { taskIdentifier: string; pipelineIdentifier: string },
>(items: T[], user: ApprovalUser, deps: Pick<ApprovalAuthDeps, 'getOwner'>): Promise<T[]> {
  const out: T[] = [];
  for (const item of items)
    if (!(await isHidden(item as any, user, deps as ApprovalAuthDeps))) out.push(item);
  return out;
}

export type DecisionAuthResult =
  | { allowed: true; item: PendingApprovalItem }
  | { allowed: false; error: string };

/** Whether this user may decide this run, given the pending approvals they could list. */
export async function authorizeDecision(
  pipelineIdentifier: unknown,
  pending: PendingApprovalItem[],
  user: ApprovalUser,
  deps: ApprovalAuthDeps
): Promise<DecisionAuthResult> {
  const item =
    typeof pipelineIdentifier === 'string'
      ? pending.find((p) => p.pipelineIdentifier === pipelineIdentifier)
      : undefined;
  // Hidden runs get the same answer as missing ones, so probing reveals nothing.
  if (!item || (await isHidden(item, user, deps))) {
    return { allowed: false, error: 'Nothing is waiting for approval on this run' };
  }
  const blockedBy = decideBlock(user, item, await deps.getRequester(item.pipelineIdentifier));
  if (blockedBy === 'requester') {
    return {
      allowed: false,
      error: 'Permission denied: you started this run, so someone else has to decide it',
    };
  }
  if (blockedBy === 'approvers') {
    const who = item.approvers?.length ? item.approvers.join(', ') : 'editors and admins';
    return { allowed: false, error: `Permission denied: only ${who} can decide this approval` };
  }
  return { allowed: true, item };
}

// Authorization for `pipelineCancel`. A run that persists is named by its
// pipelineIdentifier and follows the same rule as `exec`: a private workflow owned by
// someone else is reported as not found. A run that doesn't persist (an app runnable
// with `persist: false`) is named by the correlationId of the request that started it,
// and only the connection that sent that request may cancel it.
import { isHiddenWorkflow } from './appAuthorization.js';

export interface CancelAuthDeps {
  /** The run's detail (with its workflow), or null when there's no such run. */
  getRun(pipelineIdentifier: string): Promise<{ task?: { identifier?: string } | null } | null>;
  getOwner(taskIdentifier: string): Promise<{ user_id: string; visibility: string } | null>;
  /** Whether this connection sent the request with this correlationId. */
  ownsRequest(correlationId: string): boolean;
}

export type CancelAuthResult =
  | {
      allowed: true;
      target: { pipelineIdentifier: string } | { correlationId: string };
      taskIdentifier: string | null;
    }
  | { allowed: false; error: 'Run not found' };

export async function authorizeCancel(
  params: any,
  user: { id: string; role: string },
  deps: CancelAuthDeps
): Promise<CancelAuthResult> {
  const denied = { allowed: false, error: 'Run not found' } as const;
  const pipelineIdentifier = typeof params?.pipelineIdentifier === 'string' ? params.pipelineIdentifier : '';
  const correlationId = typeof params?.correlationId === 'string' ? params.correlationId : '';

  if (pipelineIdentifier) {
    let run: Awaited<ReturnType<CancelAuthDeps['getRun']>> = null;
    try {
      run = await deps.getRun(pipelineIdentifier);
    } catch {
      return denied;
    }
    if (!run) return denied;
    const taskIdentifier = run.task?.identifier ?? null;
    if (await isHiddenWorkflow(taskIdentifier ?? undefined, user, deps)) return denied;
    return { allowed: true, target: { pipelineIdentifier }, taskIdentifier };
  }
  if (correlationId && deps.ownsRequest(correlationId)) {
    return { allowed: true, target: { correlationId }, taskIdentifier: null };
  }
  return denied;
}

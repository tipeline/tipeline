import Core from '@engine/Core';

const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * Decides approvals nobody decided in time (approval.request with a `timeout`): rejected,
 * or approved with `onTimeout: approve`, recorded as `decidedBy: timeout`. Deciding
 * resumes the run like a person's decision would.
 *
 * Runs on a plain interval in the main Core process, like HubPoller — it only reads the
 * database and submits resume jobs. It also checks once at start, so requests that expired
 * while Core was stopped are decided when it comes back.
 */
export class ApprovalTimeoutService {
  private static timer: NodeJS.Timeout | null = null;
  private static checking = false;

  static start(): void {
    if (this.timer) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Decides every expired approval; returns the runs it decided. */
  static async check(now = new Date()): Promise<string[]> {
    if (this.checking) return [];
    this.checking = true;
    const decided: string[] = [];
    try {
      const pending = await Core.approvalList();
      for (const item of pending) {
        if (!item.expiresAt || new Date(item.expiresAt).getTime() > now.getTime()) continue;
        try {
          await Core.approvalDecide({
            pipelineIdentifier: item.pipelineIdentifier,
            approved: item.onTimeout === 'approve',
            comment: `No decision within ${item.timeout ?? 'the time limit'}`,
            decidedBy: 'timeout',
          });
          decided.push(item.pipelineIdentifier);
        } catch (error: any) {
          // Someone decided it in the meantime — nothing to do.
          console.warn(`[ApprovalTimeout] ${item.pipelineIdentifier}: ${error?.message ?? error}`);
        }
      }
    } catch (error) {
      console.error('[ApprovalTimeout] Check failed:', error);
    } finally {
      this.checking = false;
    }
    return decided;
  }
}

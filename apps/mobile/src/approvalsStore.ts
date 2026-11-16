import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useSession } from './session';


/** A run waiting at an approval.request, as the Server lists it for this user. */
export interface PendingApproval {
  pipelineIdentifier: string;
  taskIdentifier: string;
  workflowName: string;
  title: string;
  details: string | null;
  requestedAt: string;
  expiresAt?: string | null;
  onTimeout?: 'reject' | 'approve' | null;
  approvers?: string[] | null;
  /** Whether this user may decide it, and why not. */
  canDecide?: boolean;
  blockedBy?: 'approvers' | 'requester' | null;
  /** Email of who started the run, when a signed-in user did. */
  requestedBy?: string | null;
}

/** A past decision (approvalHistory). */
export interface ApprovalDecision {
  key: string;
  pipelineIdentifier: string;
  workflowName: string;
  title: string;
  approved: boolean;
  comment: string;
  /** Empty when the request timed out and was decided automatically. */
  decidedBy: string;
  decidedAt: string | null;
}

/**
 * Runs waiting for approval, for the Inbox and Home. The Inbox store refreshes it (every
 * 30 s and when runs end). `count` is only the ones this user may decide.
 */
export const useApprovals = defineStore('mobile-approvals', () => {
  const session = useSession();
  const items = ref<PendingApproval[]>([]);
  const loaded = ref(false);
  const error = ref('');
  /** The run whose decision is being sent. */
  const deciding = ref<string | null>(null);
  const count = computed(() => items.value.filter((i) => i.canDecide !== false).length);

  let inFlight: Promise<void> | null = null;
  async function load() {
    try {
      items.value = (await session.api().request<PendingApproval[]>('approvalList', {})) ?? [];
      error.value = '';
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loaded.value = true;
    }
  }
  /** Re-reads the list; calls made while one is on its way share it. */
  function refresh(): Promise<void> {
    if (!session.client) return Promise.resolve();
    inFlight ??= load().finally(() => (inFlight = null));
    return inFlight;
  }

  /** Records the decision as the signed-in user; the run carries on (or stops) on the Server. */
  async function decide(item: PendingApproval, approved: boolean, comment: string) {
    deciding.value = item.pipelineIdentifier;
    try {
      await session.api().request('approvalDecide', {
        pipelineIdentifier: item.pipelineIdentifier,
        approved,
        comment: comment.trim(),
      });
      items.value = items.value.filter((i) => i.pipelineIdentifier !== item.pipelineIdentifier);
    } finally {
      deciding.value = null;
      void refresh();
    }
  }

  async function history(limit = 50): Promise<ApprovalDecision[]> {
    return (await session.api().request<ApprovalDecision[]>('approvalHistory', { limit })) ?? [];
  }

  // Another sign-in is another list. The Inbox store keeps it fresh (polling, run ends).
  watch(
    () => session.client,
    () => {
      items.value = [];
      loaded.value = false;
      error.value = '';
    }
  );

  return { items, loaded, error, deciding, count, refresh, decide, history };
});

// A run as Core's pipeline list returns it (Home's Recent runs, the Runs page).
export type Item = {
  identifier: string;
  status: 'running' | 'completed' | 'pending' | 'failed' | 'paused' | 'canceled';
  started_at: string;
  finished_at: string | null;
  task_name?: string;
  task_identifier?: string;
  metadata?: {
    reason?: 'crashed' | 'action_error' | 'approval_rejected' | 'user_canceled';
    message?: string;
    /** Set while the run waits at an approval step. */
    approval?: { title: string } | null;
  } | null;
  // Populated when connected to a server (from pipeline_audit table)
  triggered_by_type?: 'user' | 'webhook' | 'schedule' | 'app';
  triggered_by_name?: string | null;
};

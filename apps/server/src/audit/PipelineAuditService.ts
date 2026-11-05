import { randomBytes } from 'crypto';
import { db } from '../db/database.js';

export type TriggerType = 'user' | 'webhook' | 'schedule' | 'app';

export interface PipelineAuditRow {
  id: string;
  correlation_id: string;
  pipeline_id: string | null;
  task_identifier: string;
  triggered_by_type: TriggerType;
  triggered_by_ref: string | null;
  triggered_by_name: string | null;
  requested_by_user_id: string | null;
  requested_by_email: string | null;
  triggered_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'error';
}

export const PipelineAuditService = {
  async start(
    correlationId: string,
    taskIdentifier: string,
    type: TriggerType,
    ref: string | null,
    name: string | null,
    requestedBy: { id: string; email: string } | null = null
  ): Promise<void> {
    const id = randomBytes(8).toString('hex');
    await db('pipeline_audit')
      .insert({
        id,
        correlation_id: correlationId,
        task_identifier: taskIdentifier,
        triggered_by_type: type,
        triggered_by_ref: ref,
        triggered_by_name: name,
        requested_by_user_id: requestedBy?.id ?? null,
        requested_by_email: requestedBy?.email ?? null,
        triggered_at: new Date().toISOString(),
        status: 'running',
      })
      .onConflict('id')
      .ignore();
  },

  async attachPipelineId(correlationId: string, pipelineId: string): Promise<void> {
    await db('pipeline_audit').where({ correlation_id: correlationId }).update({ pipeline_id: pipelineId });
  },

  async complete(correlationId: string, status: 'completed' | 'error'): Promise<void> {
    await db('pipeline_audit')
      .where({ correlation_id: correlationId, status: 'running' })
      .update({ status, completed_at: new Date().toISOString() });
  },

  /** Who started this run (by pipeline identifier), when a signed-in user did. */
  async getRequester(pipelineIdentifier: string): Promise<{ id: string; email: string } | null> {
    const row = await db('pipeline_audit')
      .where({ pipeline_id: pipelineIdentifier })
      .whereNotNull('requested_by_user_id')
      .orderBy('triggered_at', 'asc')
      .first('requested_by_user_id', 'requested_by_email');
    return row ? { id: row.requested_by_user_id, email: row.requested_by_email ?? '' } : null;
  },

  async list(limit = 100, offset = 0): Promise<PipelineAuditRow[]> {
    return db('pipeline_audit').orderBy('triggered_at', 'desc').limit(limit).offset(offset);
  },

  async listByTask(taskIdentifier: string, limit = 50): Promise<PipelineAuditRow[]> {
    return db('pipeline_audit')
      .where({ task_identifier: taskIdentifier })
      .orderBy('triggered_at', 'desc')
      .limit(limit);
  },
};

import { randomBytes } from 'crypto';
import { db } from '../db/database.js';

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
  ip: string | null;
  created_at: string;
}

function toEntry(row: AuditLogRow): AuditLogEntry {
  return { ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null };
}

export const AuditLogService = {
  async log(entry: {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<void> {
    await db('audit_log').insert({
      id: randomBytes(8).toString('hex'),
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip: entry.ip ?? null,
      created_at: new Date().toISOString(),
    });
  },

  async list(filters: { action?: string; limit?: number; offset?: number } = {}): Promise<AuditLogEntry[]> {
    const limit = Math.min(filters.limit ?? 100, 500);
    let query = db('audit_log').orderBy('created_at', 'desc').limit(limit).offset(filters.offset ?? 0);
    if (filters.action) query = query.where('action', filters.action);
    const rows = await query.select<AuditLogRow[]>();
    return rows.map(toEntry);
  },
};

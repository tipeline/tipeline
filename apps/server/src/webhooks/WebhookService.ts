import { randomBytes, createHash } from 'crypto';
import { db } from '../db/database.js';

export interface WebhookRow {
  id: string;
  name: string;
  task_identifier: string;
  token_hash: string;
  method: string;
  enabled: number;
  variables_mapping: string | null;
  created_by: string;
  created_at: string;
  last_triggered_at: string | null;
}

export interface WebhookPublic {
  id: string;
  name: string;
  task_identifier: string;
  method: string;
  enabled: number;
  variables_mapping: Record<string, string> | null;
  created_by: string;
  created_at: string;
  last_triggered_at: string | null;
}

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateId(): string {
  return randomBytes(8).toString('hex');
}

function toPublic(row: WebhookRow): WebhookPublic {
  return {
    id: row.id,
    name: row.name,
    task_identifier: row.task_identifier,
    method: row.method,
    enabled: row.enabled,
    variables_mapping: row.variables_mapping ? JSON.parse(row.variables_mapping) : null,
    created_by: row.created_by,
    created_at: row.created_at,
    last_triggered_at: row.last_triggered_at,
  };
}

export const WebhookService = {
  async create(data: {
    name: string;
    task_identifier: string;
    method?: string;
    variables_mapping?: Record<string, string> | null;
    created_by: string;
  }): Promise<{ webhook: WebhookPublic; token: string }> {
    const id = generateId();
    const token = randomBytes(32).toString('hex');
    const token_hash = hashWebhookToken(token);
    const now = new Date().toISOString();

    await db('webhooks').insert({
      id,
      name: data.name,
      task_identifier: data.task_identifier,
      token_hash,
      method: data.method ?? 'POST',
      enabled: 1,
      variables_mapping: data.variables_mapping ? JSON.stringify(data.variables_mapping) : null,
      created_by: data.created_by,
      created_at: now,
    });

    const row = await db('webhooks').where({ id }).first<WebhookRow>();
    return { webhook: toPublic(row!), token };
  },

  async list(): Promise<WebhookPublic[]> {
    const rows = await db('webhooks').orderBy('created_at', 'desc').select<WebhookRow[]>();
    return rows.map(toPublic);
  },

  async getById(id: string): Promise<WebhookPublic | null> {
    const row = await db('webhooks').where({ id }).first<WebhookRow>();
    return row ? toPublic(row) : null;
  },

  async findByTokenHash(tokenHash: string): Promise<WebhookRow | null> {
    return (await db('webhooks').where({ token_hash: tokenHash }).first<WebhookRow>()) ?? null;
  },

  async update(
    id: string,
    data: {
      name?: string;
      task_identifier?: string;
      method?: string;
      enabled?: number;
      variables_mapping?: Record<string, string> | null;
    }
  ): Promise<WebhookPublic> {
    const updates: Record<string, string | number | null> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.task_identifier !== undefined) updates.task_identifier = data.task_identifier;
    if (data.method !== undefined) updates.method = data.method;
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if ('variables_mapping' in data) {
      updates.variables_mapping = data.variables_mapping ? JSON.stringify(data.variables_mapping) : null;
    }
    if (Object.keys(updates).length === 0) throw new Error('Nothing to update');
    await db('webhooks').where({ id }).update(updates);
    const row = await db('webhooks').where({ id }).first<WebhookRow>();
    if (!row) throw new Error(`Webhook not found: ${id}`);
    return toPublic(row);
  },

  async delete(id: string): Promise<void> {
    await db('webhooks').where({ id }).delete();
  },

  async rotateToken(id: string): Promise<{ webhook: WebhookPublic; token: string }> {
    const existing = await db('webhooks').where({ id }).first<WebhookRow>();
    if (!existing) throw new Error(`Webhook not found: ${id}`);
    const token = randomBytes(32).toString('hex');
    const token_hash = hashWebhookToken(token);
    await db('webhooks').where({ id }).update({ token_hash });
    const row = await db('webhooks').where({ id }).first<WebhookRow>();
    return { webhook: toPublic(row!), token };
  },

  async updateLastTriggered(id: string): Promise<void> {
    await db('webhooks').where({ id }).update({ last_triggered_at: new Date().toISOString() });
  },
};

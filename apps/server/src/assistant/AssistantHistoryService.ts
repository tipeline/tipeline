import { parseChoiceMemory, type ChoiceMemory } from '@tipeline/agent';
import { db } from '../db/database.js';

export type AssistantRequestStatus = 'thinking' | 'answered' | 'proposed' | 'running' | 'completed' | 'failed';

export interface AssistantRequestRow {
  id: string;
  user_id: string;
  prompt: string;
  status: AssistantRequestStatus;
  task_identifier: string | null;
  task_name: string | null;
  pipeline_identifier: string | null;
  answer: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** A request as the history shows it; who asked is there for an admin's list of everyone's. */
export interface AssistantRequestItem {
  id: string;
  prompt: string;
  status: AssistantRequestStatus;
  taskIdentifier: string | null;
  taskName: string | null;
  pipelineIdentifier: string | null;
  answer: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string };
}

export type AssistantRequestChanges = Partial<
  Pick<AssistantRequestRow, 'status' | 'task_identifier' | 'task_name' | 'pipeline_identifier' | 'answer' | 'error'>
>;

const MAX_LIST = 200;

const toItem = (row: AssistantRequestRow & { user_email: string; user_name: string }): AssistantRequestItem => ({
  id: row.id,
  prompt: row.prompt,
  status: row.status,
  taskIdentifier: row.task_identifier,
  taskName: row.task_name,
  pipelineIdentifier: row.pipeline_identifier,
  answer: row.answer,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  user: { id: row.user_id, email: row.user_email, name: row.user_name },
});

/** The assistant's requests and each user's remembered picks, in the Server's database. */
export const AssistantHistoryService = {
  async create(id: string, userId: string, prompt: string): Promise<void> {
    const now = new Date().toISOString();
    await db('assistant_requests').insert({
      id,
      user_id: userId,
      prompt,
      status: 'thinking',
      created_at: now,
      updated_at: now,
    });
  },

  async update(id: string, changes: AssistantRequestChanges): Promise<void> {
    await db('assistant_requests')
      .where({ id })
      .update({ ...changes, updated_at: new Date().toISOString() });
  },

  async get(id: string): Promise<AssistantRequestRow | null> {
    return (await db('assistant_requests').where({ id }).first<AssistantRequestRow>()) ?? null;
  },

  /** Newest first; one user's, or everyone's when userId is null. */
  async list(userId: string | null, limit = 50): Promise<AssistantRequestItem[]> {
    const query = db('assistant_requests as r')
      .join('users as u', 'u.id', 'r.user_id')
      .select('r.*', 'u.email as user_email', 'u.name as user_name')
      .orderBy('r.created_at', 'desc')
      .limit(Math.max(1, Math.min(MAX_LIST, Math.floor(limit) || 50)));
    if (userId) query.where('r.user_id', userId);
    return (await query).map(toItem);
  },

  async getChoices(userId: string): Promise<ChoiceMemory> {
    const row = await db('assistant_choices').where({ user_id: userId }).first<{ choices: string }>();
    return parseChoiceMemory(row?.choices);
  },

  async saveChoices(userId: string, choices: ChoiceMemory): Promise<void> {
    await db('assistant_choices')
      .insert({ user_id: userId, choices: JSON.stringify(choices), updated_at: new Date().toISOString() })
      .onConflict('user_id')
      .merge();
  },
};

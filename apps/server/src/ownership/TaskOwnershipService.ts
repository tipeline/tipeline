import { db } from '../db/database.js';

export interface TaskOwnership {
  task_identifier: string;
  user_id: string;
  user_email: string;
  user_name: string;
  visibility: 'shared' | 'private';
  created_at: string;
  updated_at: string;
}

const ownershipCols = [
  'o.task_identifier',
  'o.user_id',
  'o.visibility',
  'o.created_at',
  'o.updated_at',
  'u.email as user_email',
  'u.name as user_name',
];

export const TaskOwnershipService = {
  async claim(taskIdentifier: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    await db('task_ownership')
      .insert({ task_identifier: taskIdentifier, user_id: userId, visibility: 'shared', created_at: now, updated_at: now })
      .onConflict('task_identifier')
      .ignore();
  },

  async remove(taskIdentifier: string): Promise<void> {
    await db('task_ownership').where({ task_identifier: taskIdentifier }).delete();
  },

  async getOwner(taskIdentifier: string): Promise<TaskOwnership | null> {
    return (
      (await db('task_ownership as o')
        .join('users as u', 'u.id', 'o.user_id')
        .where('o.task_identifier', taskIdentifier)
        .select<TaskOwnership>(ownershipCols)
        .first()) ?? null
    );
  },

  async isOwner(taskIdentifier: string, userId: string): Promise<boolean> {
    const row = await db('task_ownership')
      .where({ task_identifier: taskIdentifier, user_id: userId })
      .count('task_identifier as count')
      .first<{ count: number | string }>();
    return parseInt(String(row?.count ?? 0), 10) > 0;
  },

  async listAll(): Promise<TaskOwnership[]> {
    return db('task_ownership as o')
      .join('users as u', 'u.id', 'o.user_id')
      .select<TaskOwnership[]>(ownershipCols)
      .orderBy('o.created_at');
  },

  async setVisibility(
    taskIdentifier: string,
    userId: string,
    isAdmin: boolean,
    visibility: 'shared' | 'private'
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const query = db('task_ownership').where({ task_identifier: taskIdentifier });
    if (!isAdmin) query.where({ user_id: userId });
    const count = await query.update({ visibility, updated_at: now });
    return count > 0;
  },

  async privateOwnedByOthers(userId: string): Promise<Set<string>> {
    const rows = await db('task_ownership')
      .where({ visibility: 'private' })
      .whereNot({ user_id: userId })
      .select<{ task_identifier: string }[]>('task_identifier');
    return new Set(rows.map((r) => r.task_identifier));
  },
};

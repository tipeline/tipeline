import { randomBytes } from 'crypto';
import { db } from '../db/database.js';

export type PushPlatform = 'ios' | 'android';
export const PUSH_PLATFORMS: readonly PushPlatform[] = ['ios', 'android'];

/** What a device wants to hear about. `details`: workflow names on the lock screen. */
export interface PushPreferences {
  approvals: boolean;
  failures: boolean;
  finished: boolean;
  details: boolean;
}

/** Runs waiting for a decision and failures on; finished runs off; no names on the lock screen. */
export const DEFAULT_PREFERENCES: PushPreferences = { approvals: true, failures: true, finished: false, details: false };

export interface PushDevice {
  id: string;
  userId: string;
  platform: PushPlatform;
  token: string;
  locale: string | null;
  preferences: PushPreferences;
  createdAt: string;
  lastSeenAt: string;
}

/** A device with the user it belongs to, for picking who to tell. */
export interface PushRecipient extends PushDevice {
  user: { id: string; email: string; role: string };
}

/** Only the known switches, each a boolean; anything else keeps its current value. */
export function mergePreferences(current: PushPreferences, change: unknown): PushPreferences {
  const next = { ...current };
  if (change && typeof change === 'object') {
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof PushPreferences)[]) {
      const value = (change as Record<string, unknown>)[key];
      if (typeof value === 'boolean') next[key] = value;
    }
  }
  return next;
}

function parsePreferences(raw: string | null | undefined): PushPreferences {
  try {
    return mergePreferences(DEFAULT_PREFERENCES, JSON.parse(raw ?? '{}'));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

const fromRow = (row: any): PushDevice => ({
  id: row.id,
  userId: row.user_id,
  platform: row.platform,
  token: row.token,
  locale: row.locale ?? null,
  preferences: parsePreferences(row.preferences),
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
});

export const PushDeviceService = {
  /**
   * Registers a phone for this user. A token is one phone: when someone else signs in on it,
   * the token moves to them (with fresh choices), so the last person signed in gets the pushes.
   */
  async register(
    userId: string,
    input: { platform: PushPlatform; token: string; locale?: string | null; preferences?: unknown }
  ): Promise<PushDevice> {
    const now = new Date().toISOString();
    const existing = await db('push_devices').where({ token: input.token }).first();
    if (existing) {
      const sameUser = existing.user_id === userId;
      const preferences = mergePreferences(sameUser ? parsePreferences(existing.preferences) : DEFAULT_PREFERENCES, input.preferences);
      await db('push_devices')
        .where({ id: existing.id })
        .update({
          user_id: userId,
          platform: input.platform,
          locale: input.locale ?? existing.locale ?? null,
          preferences: JSON.stringify(preferences),
          last_seen_at: now,
          ...(sameUser ? {} : { created_at: now }),
        });
      return fromRow(await db('push_devices').where({ id: existing.id }).first());
    }
    const row = {
      id: randomBytes(8).toString('hex'),
      user_id: userId,
      platform: input.platform,
      token: input.token,
      locale: input.locale ?? null,
      preferences: JSON.stringify(mergePreferences(DEFAULT_PREFERENCES, input.preferences)),
      created_at: now,
      last_seen_at: now,
    };
    await db('push_devices').insert(row);
    return fromRow(row);
  },

  async listForUser(userId: string): Promise<PushDevice[]> {
    return (await db('push_devices').where({ user_id: userId }).orderBy('created_at', 'asc')).map(fromRow);
  },

  /** Changes one of this user's devices; null when it isn't theirs. */
  async updatePreferences(userId: string, id: string, change: unknown): Promise<PushDevice | null> {
    const row = await db('push_devices').where({ id, user_id: userId }).first();
    if (!row) return null;
    const preferences = mergePreferences(parsePreferences(row.preferences), change);
    await db('push_devices').where({ id }).update({ preferences: JSON.stringify(preferences) });
    return { ...fromRow(row), preferences };
  },

  /** Removes one of this user's devices (signing out on the phone). */
  async remove(userId: string, id: string): Promise<boolean> {
    return (await db('push_devices').where({ id, user_id: userId }).delete()) > 0;
  },

  /** Apple or Google said the token is no longer valid. */
  async forgetToken(token: string): Promise<void> {
    await db('push_devices').where({ token }).delete();
  },

  /** Every device of active users, with who they are; optionally only these users. */
  async recipients(userIds?: string[]): Promise<PushRecipient[]> {
    const query = db('push_devices as d')
      .join('users as u', 'u.id', 'd.user_id')
      .where('u.is_active', 1)
      .select('d.*', 'u.email as user_email', 'u.role as user_role');
    if (userIds) query.whereIn('d.user_id', userIds);
    const rows = await query;
    return rows.map((row: any) => ({
      ...fromRow(row),
      user: { id: row.user_id, email: row.user_email, role: row.user_role },
    }));
  },
};

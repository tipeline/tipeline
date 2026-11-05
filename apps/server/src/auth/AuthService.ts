import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto';
import { authenticator } from 'otplib';
import { db } from '../db/database.js';
import { clampScope, type Role } from './Permissions.js';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
}

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  scope: string | null;
  kind: string;
  revoked_at: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface TokenPublic {
  id: string;
  user_id: string;
  name: string;
  scope: string;
  kind: 'session' | 'api';
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by_email?: string;
  created_by_name?: string;
}

export type LoginResult =
  | { status: 'ok'; token: string }
  | { status: 'mfa_required'; challengeId: string }
  | { status: 'invalid' };

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;

// Fixed salt used only to burn the same scrypt cost on a failed lookup as on a real one, so
// "no such account" and "wrong password" take the same amount of time and can't be told apart.
const DUMMY_SALT = randomBytes(16).toString('hex');

function generateId(): string {
  return randomBytes(8).toString('hex');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const inputHash = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), inputHash);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateBackupCode(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

function toTokenPublic(row: TokenRow & { created_by_email?: string; created_by_name?: string }): TokenPublic {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    scope: row.scope ?? 'viewer',
    kind: row.kind === 'session' ? 'session' : 'api',
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    created_by_email: row.created_by_email,
    created_by_name: row.created_by_name,
  };
}

const TOKEN_PUBLIC_COLUMNS = [
  't.id', 't.user_id', 't.name', 't.scope', 't.kind', 't.created_at', 't.last_used_at', 't.expires_at', 't.revoked_at',
  'u.email as created_by_email', 'u.name as created_by_name',
];

export const AuthService = {
  async createUser(email: string, name: string, password: string, role = 'viewer'): Promise<User> {
    const id = generateId();
    const now = new Date().toISOString();
    const providerId = generateId();
    const hash = hashPassword(password);

    await db.transaction(async (trx) => {
      await trx('users').insert({ id, email, name, role, is_active: 1, created_at: now });
      await trx('user_auth_providers').insert({
        id: providerId,
        user_id: id,
        provider_type: 'password',
        credentials_hash: hash,
        created_at: now,
      });
    });

    return { id, email, name, role, is_active: 1, created_at: now };
  },

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await db('users').where({ email, is_active: 1 }).first<User & { mfa_enabled: number }>();
    if (!user) {
      scryptSync(password, DUMMY_SALT, 64);
      return { status: 'invalid' };
    }

    const provider = await db('user_auth_providers')
      .where({ user_id: user.id, provider_type: 'password' })
      .first<{ credentials_hash: string }>();
    if (!provider || !verifyPassword(password, provider.credentials_hash)) return { status: 'invalid' };

    if (user.mfa_enabled) {
      const id = randomBytes(16).toString('hex');
      const now = Date.now();
      await db('mfa_challenges').insert({
        id,
        user_id: user.id,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + MFA_CHALLENGE_TTL_MS).toISOString(),
      });
      return { status: 'mfa_required', challengeId: id };
    }

    const token = await AuthService.createToken(user.id, 'login', { kind: 'session' });
    return { status: 'ok', token };
  },

  async completeMfaLogin(challengeId: string, code: string): Promise<string | null> {
    await db('mfa_challenges').where('expires_at', '<', new Date().toISOString()).delete();

    const challenge = await db('mfa_challenges').where({ id: challengeId }).first<{ user_id: string; expires_at: string }>();
    if (!challenge) return null;

    const ok = await AuthService.verifyMfaCode(challenge.user_id, code);
    if (!ok) return null;

    await db('mfa_challenges').where({ id: challengeId }).delete();
    return AuthService.createToken(challenge.user_id, 'login', { kind: 'session' });
  },

  async createToken(
    userId: string,
    name: string,
    opts: { expiresAt?: string | null; scope?: string; kind?: 'session' | 'api' } = {}
  ): Promise<string> {
    const user = await db('users').where({ id: userId }).first<User>();
    if (!user) throw new Error(`User not found: ${userId}`);

    const raw = randomBytes(32).toString('hex');
    const id = generateId();
    const now = new Date().toISOString();
    const scope: Role = clampScope(user.role, opts.scope);

    await db('tokens').insert({
      id,
      user_id: userId,
      name,
      token_hash: hashToken(raw),
      scope,
      kind: opts.kind ?? 'api',
      expires_at: opts.expiresAt ?? null,
      created_at: now,
    });
    return raw;
  },

  async validateToken(raw: string): Promise<User | null> {
    if (!raw) return null;
    const hash = hashToken(raw);

    const row = await db('tokens as t')
      .join('users as u', 'u.id', 't.user_id')
      .where('t.token_hash', hash)
      .where('u.is_active', 1)
      .select<(TokenRow & User & { token_id: string })>(
        't.id as token_id',
        't.scope',
        't.revoked_at',
        't.expires_at',
        'u.id',
        'u.email',
        'u.name',
        'u.role',
        'u.is_active',
        'u.created_at'
      )
      .first();

    if (!row) return null;
    if (row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    await db('tokens').where('token_hash', hash).update({ last_used_at: new Date().toISOString() });

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      // Re-clamp against the user's CURRENT role on every validation, not just at token
      // creation: a token's stored scope is a ceiling the granting user chose, but if that
      // user's own role is later demoted, the effective permission must drop immediately too
      // instead of riding on the old, frozen scope until the token separately expires.
      role: clampScope(row.role, row.scope),
      is_active: row.is_active,
      created_at: row.created_at,
    };
  },

  async listTokens(requestingUser: User): Promise<TokenPublic[]> {
    let query = db('tokens as t')
      .join('users as u', 'u.id', 't.user_id')
      .orderBy('t.created_at', 'desc')
      .select<(TokenRow & { created_by_email: string; created_by_name: string })[]>(TOKEN_PUBLIC_COLUMNS);
    if (requestingUser.role !== 'admin') query = query.where('t.user_id', requestingUser.id);
    const rows = await query;
    return rows.map(toTokenPublic);
  },

  async getTokenOwner(id: string): Promise<string | null> {
    const row = await db('tokens').where({ id }).first<{ user_id: string }>();
    return row?.user_id ?? null;
  },

  async getTokenPublic(id: string): Promise<TokenPublic | null> {
    const row = await db('tokens as t')
      .join('users as u', 'u.id', 't.user_id')
      .where('t.id', id)
      .select<(TokenRow & { created_by_email: string; created_by_name: string })>(TOKEN_PUBLIC_COLUMNS)
      .first();
    return row ? toTokenPublic(row) : null;
  },

  /** Returns the id of the token record matching this raw bearer value — used to flag "this is your current session". */
  async currentTokenId(raw: string): Promise<string | null> {
    if (!raw) return null;
    const row = await db('tokens').where({ token_hash: hashToken(raw) }).first<{ id: string }>();
    return row?.id ?? null;
  },

  async rotateToken(id: string): Promise<string> {
    const existing = await db('tokens').where({ id }).first<TokenRow>();
    if (!existing) throw new Error(`Token not found: ${id}`);
    if (existing.kind === 'session') throw new Error('Sessions cannot be rotated — sign in again or revoke this one.');
    const raw = randomBytes(32).toString('hex');
    await db('tokens').where({ id }).update({
      token_hash: hashToken(raw),
      revoked_at: null,
      last_used_at: null,
    });
    return raw;
  },

  async revokeToken(id: string): Promise<void> {
    await db('tokens').where({ id }).update({ revoked_at: new Date().toISOString() });
  },

  async hasUsers(): Promise<boolean> {
    const row = await db('users').count('id as count').first<{ count: number | string }>();
    return parseInt(String(row?.count ?? 0), 10) > 0;
  },

  async ensureAdminRole(email: string): Promise<void> {
    const user = await db('users').where({ email }).select('id', 'role').first<{ id: string; role: string }>();
    if (user && user.role !== 'admin') {
      await db('users').where({ id: user.id }).update({ role: 'admin' });
      console.log(`[AuthService] Upgraded ${email} to admin role`);
    }
  },

  async listUsers(): Promise<User[]> {
    return db('users').select('id', 'email', 'name', 'role', 'is_active', 'created_at').orderBy('created_at');
  },

  async updateUser(id: string, data: { name?: string; role?: string; is_active?: number }): Promise<User> {
    const updates: Record<string, string | number> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.role !== undefined) updates.role = data.role;
    if (data.is_active !== undefined) updates.is_active = data.is_active;
    if (Object.keys(updates).length === 0) throw new Error('Nothing to update');
    await db('users').where({ id }).update(updates);
    const user = await db('users').where({ id }).first<User>();
    if (!user) throw new Error(`User not found: ${id}`);
    return user;
  },

  async mfaStatus(userId: string): Promise<{ enabled: boolean }> {
    const row = await db('users').where({ id: userId }).first<{ mfa_enabled: number }>();
    return { enabled: !!row?.mfa_enabled };
  },

  async mfaEnrollment(): Promise<{ enabled: number; total: number }> {
    const row = await db('users')
      .where({ is_active: 1 })
      .select(db.raw('count(*) as total'), db.raw('sum(mfa_enabled) as enabled'))
      .first<{ total: string | number; enabled: string | number | null }>();
    return { total: parseInt(String(row?.total ?? 0), 10), enabled: parseInt(String(row?.enabled ?? 0), 10) };
  },

  async startMfaEnrollment(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await db('users').where({ id: userId }).first<User>();
    if (!user) throw new Error(`User not found: ${userId}`);
    const secret = authenticator.generateSecret();
    await db('users').where({ id: userId }).update({ mfa_secret: secret });
    const otpauthUrl = authenticator.keyuri(user.email, 'Tipeline', secret);
    return { secret, otpauthUrl };
  },

  async confirmMfaEnrollment(userId: string, code: string): Promise<string[]> {
    const user = await db('users').where({ id: userId }).first<{ mfa_secret: string | null }>();
    if (!user?.mfa_secret || !authenticator.verify({ token: code, secret: user.mfa_secret })) {
      throw new Error('Invalid verification code');
    }
    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
    await db('users').where({ id: userId }).update({
      mfa_enabled: 1,
      mfa_backup_codes: JSON.stringify(backupCodes.map(hashBackupCode)),
    });
    return backupCodes;
  },

  async disableMfa(userId: string): Promise<void> {
    await db('users').where({ id: userId }).update({ mfa_enabled: 0, mfa_secret: null, mfa_backup_codes: null });
  },

  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    const provider = await db('user_auth_providers')
      .where({ user_id: userId, provider_type: 'password' })
      .first<{ credentials_hash: string }>();
    if (!provider) return false;
    return verifyPassword(password, provider.credentials_hash);
  },

  async verifyMfaCode(userId: string, code: string): Promise<boolean> {
    const user = await db('users')
      .where({ id: userId })
      .first<{ mfa_secret: string | null; mfa_backup_codes: string | null }>();
    if (!user?.mfa_secret) return false;

    if (authenticator.verify({ token: code, secret: user.mfa_secret })) return true;

    const codes: string[] = user.mfa_backup_codes ? JSON.parse(user.mfa_backup_codes) : [];
    const hashed = hashBackupCode(code.trim().toUpperCase());
    const index = codes.indexOf(hashed);
    if (index === -1) return false;

    codes.splice(index, 1);
    await db('users').where({ id: userId }).update({ mfa_backup_codes: JSON.stringify(codes) });
    return true;
  },
};

import crypto from 'crypto';
import { Settings } from '@database/models/Settings';
import { openCredential, sealCredential } from '@utils/secretBox';

/** Settings that hold a credential: encrypted in the table, plain to everyone who asks here. */
export const isCredentialSetting = (key: string) => /(_api_key|_token)$/.test(key);

export class SettingsService {
  static async get(key: string): Promise<string | null> {
    const row = await Settings.query().findById(key);
    const value = row?.value ?? null;
    return isCredentialSetting(key) ? openCredential(value) : value;
  }

  static async set(key: string, value: string): Promise<void> {
    const stored = isCredentialSetting(key) ? sealCredential(value) : value;
    await Settings.knex()('settings').insert({ key, value: stored }).onConflict('key').merge();
  }

  static async getAll(): Promise<Record<string, string>> {
    const rows = await Settings.query().whereNot('key', 'api_token');
    return Object.fromEntries(
      rows.map((r) => [r.key, isCredentialSetting(r.key) ? (openCredential(r.value) ?? '') : r.value])
    );
  }

  static async getOrCreateToken(): Promise<string> {
    const existing = await this.get('api_token');
    if (existing) return existing;

    const token = crypto.randomBytes(32).toString('hex');
    await this.set('api_token', token);
    return token;
  }
}

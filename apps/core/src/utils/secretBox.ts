import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'enc:v1:';
export const REDACTED_JSON = JSON.stringify('[REDACTED]');

let cachedKey: Buffer | null = null;

/**
 * The key lives in its own file beside the database, so the database alone (a copied
 * file, a support bundle) doesn't reveal secrets. Whoever can read both can read them.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const file =
    process.env.TIPELINE_SECRET_KEY_FILE || path.join(os.homedir(), 'Tipeline', '.database', 'secret.key');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
  } catch (error: any) {
    // Already there: Core made it on an earlier start, or a worker just did.
    if (error?.code !== 'EEXIST') throw error;
  }
  cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  return cachedKey;
}

export const isSealed = (stored: unknown): stored is string =>
  typeof stored === 'string' && stored.startsWith(PREFIX);

export function seal(plain: string): string {
  if (isSealed(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')}`;
}

/** The stored text, decrypted if it was sealed. A value that can't be read (lost key) is JSON null. */
export function unseal(stored: string): string;
export function unseal(stored: string | null | undefined): string | null | undefined;
export function unseal(stored: string | null | undefined) {
  if (!isSealed(stored)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch (error: any) {
    console.warn(`[secrets] A stored secret can't be read: ${error?.message ?? error}`);
    return 'null';
  }
}

/** Encrypts a stored credential (an API key, a token). Nothing to hide stays as it is. */
export const sealCredential = <T extends string | null | undefined>(value: T): T | string =>
  value ? seal(value) : value;

/** A stored credential as plain text; one that can't be read (lost key) counts as not set. */
export function openCredential(stored: string | null | undefined): string | null {
  if (!stored) return stored ?? null;
  if (!isSealed(stored)) return stored;
  const opened = unseal(stored);
  // Credentials aren't JSON, so 'null' here can only be unseal's "couldn't read it".
  return opened === 'null' ? null : opened;
}

const EMPTY_BY_TYPE: Record<string, unknown> = { string: '', number: 0, boolean: false, array: [], object: {} };

/**
 * A workflow source with its secret variables' written-in values replaced, and how many.
 * `placeholder` stands in for strings: a run's snapshot needs a value that passes a
 * `required` check (the real one is restored from its sealed row), an export leaves it blank.
 */
export function redactSecretValues<T>(source: T, placeholder = ''): { source: T; count: number } {
  const variables = (source as any)?.pipeline?.variables;
  if (!Array.isArray(variables)) return { source, count: 0 };
  let count = 0;
  const redacted = variables.map((variable: any) => {
    if (!variable?.secret || variable.value === undefined || variable.value === null || variable.value === '') {
      return variable;
    }
    count++;
    const empty = variable.type in EMPTY_BY_TYPE ? EMPTY_BY_TYPE[variable.type] : '';
    return { ...variable, value: typeof empty === 'string' ? placeholder : empty };
  });
  return {
    source: count ? { ...(source as any), pipeline: { ...(source as any).pipeline, variables: redacted } } : source,
    count,
  };
}

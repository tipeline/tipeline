import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isCacheableCall } from '@tipeline/schemas';
import { PluginCacheableRegistry } from '@/plugin/PluginCacheableRegistry';

// Bumped when what a key is made of, or how a cached action behaves, changes — old
// entries then stop matching and age out.
export const CACHE_FORMAT = 1;

/** Thrown while building a key from a value that isn't plain data (a live handle). */
class NotPlainData extends Error {}

// A database connection is a live Knex handle; two different databases must never
// share a key, so it's replaced by where it points (never the password).
const knexFingerprint = (value: any) => {
  const config = value?.client?.config;
  if (!config) return null;
  const conn = typeof config.connection === 'object' && config.connection ? config.connection : {};
  return {
    $knex: {
      client: String(config.client ?? ''),
      host: conn.host ?? null,
      port: conn.port ?? null,
      database: conn.database ?? null,
      user: conn.user ?? null,
      filename: conn.filename ?? (typeof config.connection === 'string' ? '<url>' : null),
      url: typeof config.connection === 'string' ? config.connection.replace(/\/\/[^@/]*@/, '//') : null,
    },
  };
};

const looksLikePath = (value: string) =>
  value.length < 1024 &&
  !value.includes('\n') &&
  (value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value));

/**
 * The value as plain JSON with object keys sorted, so equal params give equal text.
 * Throws NotPlainData on anything that isn't data (functions, class instances,
 * buffers) — except a database connection, which becomes its fingerprint. With
 * `files`, every string that names an existing file or folder adds its size and
 * change time there, so a file edited since the result was stored misses the cache.
 */
function canonical(value: any, files: Record<string, [number, number]> | null): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (files && looksLikePath(value)) {
      const resolved = value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value;
      try {
        const stat = fs.statSync(resolved);
        files[resolved] = [stat.mtimeMs, stat.size];
      } catch {
        // Not a path after all, or not there yet.
      }
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (typeof value === 'function') {
    const fingerprint = knexFingerprint(value);
    if (fingerprint) return fingerprint;
    throw new NotPlainData();
  }
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Array.isArray(value)) return value.map((item) => canonical(item, files));
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new NotPlainData();
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = canonical(value[key], files);
  }
  return out;
}

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Canonical JSON text of plain data, or null when it holds something that isn't data.
 * Used for workflow inputs, which are always plain.
 */
export function canonicalJson(value: unknown): string | null {
  try {
    return JSON.stringify(canonical(value, null));
  } catch (error) {
    if (error instanceof NotPlainData) return null;
    throw error;
  }
}

/**
 * The cache key for a step run with these resolved params, or null when this call
 * can't be cached: the action isn't cacheable, this call isn't (an HTTP POST, an
 * UPDATE), or a param is a live handle that has no fingerprint.
 */
export function stepCacheKey(
  action: { group: string; name: string; source?: 'plugin' },
  params: Record<string, any>,
  keyParams?: string[]
): string | null {
  let version = '';
  if (action.source === 'plugin') {
    const entry = PluginCacheableRegistry[action.group];
    if (!entry?.actions.includes(action.name)) return null;
    version = entry.version;
  } else if (!isCacheableCall(action.group, action.name, params ?? {})) {
    return null;
  }

  const picked: Record<string, any> = {};
  if (keyParams?.length) {
    for (const name of keyParams) picked[name] = params?.[name];
  }

  const files: Record<string, [number, number]> = {};
  let body: any;
  try {
    body = canonical(keyParams?.length ? picked : (params ?? {}), files);
  } catch (error) {
    if (error instanceof NotPlainData) return null;
    throw error;
  }

  return sha256(
    JSON.stringify({
      format: CACHE_FORMAT,
      kind: 'action',
      action: `${action.source === 'plugin' ? 'plugin:' : ''}${action.group}.${action.name}`,
      version,
      params: body,
      files: canonical(files, null),
    })
  );
}

/** The cache key for a workflow called with these inputs and asked for these outputs. */
export function workflowCacheKey(parts: {
  identifier: string;
  source: unknown;
  inputs: Record<string, unknown>;
  outsideValues: Record<string, unknown>;
  outputs: string[];
}): string | null {
  const source = canonicalJson(parts.source);
  const inputs = canonicalJson(parts.inputs);
  const outside = canonicalJson(parts.outsideValues);
  if (source === null || inputs === null || outside === null) return null;
  return sha256(
    JSON.stringify({
      format: CACHE_FORMAT,
      kind: 'workflow',
      identifier: parts.identifier,
      source: sha256(source),
      inputs,
      outside,
      outputs: [...parts.outputs].sort(),
    })
  );
}

import { CacheEntry } from '@database/models/CacheEntry';
import { SettingsService } from '@database/services/SettingsService';

export type CacheKind = 'action' | 'workflow';

export interface CacheHit {
  value: unknown;
  createdAt: string;
  sourcePipeline: string | null;
}

export interface CacheEntrySummary {
  key: string;
  kind: CacheKind;
  owner: string | null;
  label: string;
  sizeBytes: number;
  ttlSeconds: number;
  hits: number;
  sourcePipeline: string | null;
  createdAt: string;
  lastHitAt: string | null;
  expiresAt: string;
}

// Settings key for the total size the cache may grow to, in MB.
export const CACHE_MAX_SIZE_SETTING = 'cache.maxSizeMb';
export const DEFAULT_CACHE_MAX_SIZE_MB = 100;

const expiresAt = (createdAt: string, ttlSeconds: number) =>
  new Date(new Date(createdAt).getTime() + ttlSeconds * 1000);

/**
 * Stored results of cached steps and workflows (see packages/schemas/src/cache.ts for
 * what can be cached). Every run is its own worker thread, so the cache lives in
 * SQLite, not memory: it's shared by all runs and survives a restart.
 */
export class CacheService {
  /**
   * The entry for `key` when it's younger than `ttlSeconds` — the step's or workflow's
   * TTL now, not the one it was stored with, so lowering a TTL takes effect at once.
   * An expired entry is removed.
   */
  static async get(key: string, ttlSeconds: number): Promise<CacheHit | null> {
    const row = await CacheEntry.query().findById(key);
    if (!row) return null;
    if (expiresAt(row.created_at, ttlSeconds).getTime() <= Date.now()) {
      await CacheEntry.query().deleteById(key);
      return null;
    }
    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      await CacheEntry.query().deleteById(key);
      return null;
    }
    await CacheEntry.query()
      .patch({ hits: row.hits + 1, last_hit_at: new Date().toISOString() })
      .where({ key });
    return { value, createdAt: row.created_at, sourcePipeline: row.source_pipeline };
  }

  /**
   * Stores a result. Skipped (returns false) when it can't be stored as JSON, or when
   * it alone would take more than a tenth of the cache's size limit.
   */
  static async set(entry: {
    key: string;
    kind: CacheKind;
    owner: string | null;
    label: string;
    value: unknown;
    ttlSeconds: number;
    sourcePipeline?: string | null;
  }): Promise<boolean> {
    let json: string | undefined;
    try {
      json = JSON.stringify(entry.value ?? null);
    } catch {
      return false;
    }
    if (json === undefined) return false;
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    if (sizeBytes > (await CacheService.maxSizeBytes()) / 10) return false;

    await CacheEntry.knex()('cache_entries')
      .insert({
        key: entry.key,
        kind: entry.kind,
        owner: entry.owner,
        label: entry.label,
        value: json,
        size_bytes: sizeBytes,
        ttl_seconds: entry.ttlSeconds,
        hits: 0,
        source_pipeline: entry.sourcePipeline || null,
        created_at: new Date().toISOString(),
        last_hit_at: null,
      })
      .onConflict('key')
      .merge();
    return true;
  }

  /** Every entry, newest first, without its value. */
  static async list(filter: { owner?: string } = {}): Promise<CacheEntrySummary[]> {
    const query = CacheEntry.query()
      .select(
        'key',
        'kind',
        'owner',
        'label',
        'size_bytes',
        'ttl_seconds',
        'hits',
        'source_pipeline',
        'created_at',
        'last_hit_at'
      )
      .orderBy('created_at', 'desc');
    if (filter.owner) query.where({ owner: filter.owner });
    const rows = await query;
    return rows.map((r) => ({
      key: r.key,
      kind: r.kind,
      owner: r.owner,
      label: r.label,
      sizeBytes: r.size_bytes,
      ttlSeconds: r.ttl_seconds,
      hits: r.hits,
      sourcePipeline: r.source_pipeline,
      createdAt: r.created_at,
      lastHitAt: r.last_hit_at,
      expiresAt: expiresAt(r.created_at, r.ttl_seconds).toISOString(),
    }));
  }

  /** Removes entries: one (`key`), one workflow's (`owner`), or all. Returns how many. */
  static async clear(filter: { key?: string; owner?: string } = {}): Promise<number> {
    const query = CacheEntry.query().delete();
    if (filter.key) query.where({ key: filter.key });
    if (filter.owner) query.where({ owner: filter.owner });
    return await query;
  }

  static async stats(): Promise<{ count: number; sizeBytes: number; maxSizeBytes: number }> {
    const row: any = await CacheEntry.knex()('cache_entries')
      .count({ count: '*' })
      .sum({ sizeBytes: 'size_bytes' })
      .first();
    return {
      count: Number(row?.count ?? 0),
      sizeBytes: Number(row?.sizeBytes ?? 0),
      maxSizeBytes: await CacheService.maxSizeBytes(),
    };
  }

  /**
   * Removes expired entries (by the TTL they were stored with), then the oldest ones
   * until the cache is under its size limit. Returns how many were removed.
   */
  static async sweep(now = Date.now()): Promise<number> {
    const rows = await CacheEntry.query()
      .select('key', 'created_at', 'ttl_seconds', 'size_bytes')
      .orderBy('created_at', 'asc');

    const remove: string[] = [];
    const kept: typeof rows = [];
    for (const row of rows) {
      if (expiresAt(row.created_at, row.ttl_seconds).getTime() <= now) remove.push(row.key);
      else kept.push(row);
    }

    const limit = await CacheService.maxSizeBytes();
    let total = kept.reduce((sum, r) => sum + r.size_bytes, 0);
    for (const row of kept) {
      if (total <= limit) break;
      remove.push(row.key);
      total -= row.size_bytes;
    }

    for (let i = 0; i < remove.length; i += 500) {
      await CacheEntry.query().delete().whereIn('key', remove.slice(i, i + 500));
    }
    return remove.length;
  }

  static async maxSizeBytes(): Promise<number> {
    const raw = await SettingsService.get(CACHE_MAX_SIZE_SETTING);
    const mb = Number(raw);
    return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_CACHE_MAX_SIZE_MB) * 1024 * 1024;
  }
}

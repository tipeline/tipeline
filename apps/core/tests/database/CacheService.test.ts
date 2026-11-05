import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { CacheService, CACHE_MAX_SIZE_SETTING } from '@database/services/CacheService';

// Real in-memory SQLite with the real migrations: expiry, hit counts and eviction are
// all about what's actually stored.
let knex: Knex;

beforeAll(async () => {
  knex = knexFactory({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: path.resolve(__dirname, '../../src/database/migrations') },
  });
  await knex.migrate.latest();
  Model.knex(knex);
});
afterAll(() => knex.destroy());

beforeEach(async () => {
  await knex('cache_entries').del();
  await knex('settings').where({ key: CACHE_MAX_SIZE_SETTING }).del();
});
afterEach(() => {
  vi.useRealTimers();
});

const entry = (key: string, value: unknown, extra: Record<string, unknown> = {}) => ({
  key,
  kind: 'action' as const,
  owner: 'wf-1',
  label: 'math.sum',
  value,
  ttlSeconds: 3600,
  ...extra,
});

describe('CacheService', () => {
  it('returns a stored value while it is fresh, counting the hits', async () => {
    expect(await CacheService.set(entry('k1', { total: 5 }, { sourcePipeline: 'p-1' }))).toBe(true);
    const hit = await CacheService.get('k1', 3600);
    expect(hit).toMatchObject({ value: { total: 5 }, sourcePipeline: 'p-1' });
    await CacheService.get('k1', 3600);
    const [row] = await knex('cache_entries').where({ key: 'k1' });
    expect(row.hits).toBe(2);
    expect(row.last_hit_at).not.toBeNull();
  });

  it('misses an unknown key', async () => {
    expect(await CacheService.get('nope', 3600)).toBeNull();
  });

  it('expires by the TTL asked for now, so lowering a TTL applies at once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
    await CacheService.set(entry('k1', 5));
    vi.setSystemTime(new Date('2026-10-08T10:30:00Z'));
    expect(await CacheService.get('k1', 3600)).not.toBeNull();
    // Stored for an hour, but the step now says 10 minutes: expired, and removed.
    expect(await CacheService.get('k1', 600)).toBeNull();
    expect(await knex('cache_entries').count({ n: '*' }).first()).toEqual({ n: 0 });
  });

  it('replaces an entry stored again under the same key', async () => {
    await CacheService.set(entry('k1', 1));
    await CacheService.set(entry('k1', 2));
    expect((await CacheService.get('k1', 3600))?.value).toBe(2);
  });

  it('keeps null and false as real results', async () => {
    await CacheService.set(entry('n', null));
    await CacheService.set(entry('f', false));
    expect(await CacheService.get('n', 3600)).toMatchObject({ value: null });
    expect(await CacheService.get('f', 3600)).toMatchObject({ value: false });
  });

  it('skips a value that would take more than a tenth of the size limit', async () => {
    await knex('settings').insert({ key: CACHE_MAX_SIZE_SETTING, value: '1' });
    expect(await CacheService.set(entry('big', 'x'.repeat(200 * 1024)))).toBe(false);
    expect(await CacheService.set(entry('small', 'x'.repeat(50 * 1024)))).toBe(true);
  });

  it('lists entries newest first without their values, and clears by key, workflow or all', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
    await CacheService.set(entry('a', 1));
    vi.setSystemTime(new Date('2026-10-08T10:01:00Z'));
    await CacheService.set(entry('b', 2, { owner: 'wf-2', kind: 'workflow', label: 'List People' }));
    vi.setSystemTime(new Date('2026-10-08T10:02:00Z'));
    await CacheService.set(entry('c', 3));

    const list = await CacheService.list();
    expect(list.map((e) => e.key)).toEqual(['c', 'b', 'a']);
    expect(list[1]).toMatchObject({ kind: 'workflow', label: 'List People', expiresAt: '2026-10-08T11:01:00.000Z' });
    expect(list[0]).not.toHaveProperty('value');
    expect((await CacheService.list({ owner: 'wf-2' })).map((e) => e.key)).toEqual(['b']);

    expect(await CacheService.clear({ key: 'a' })).toBe(1);
    expect(await CacheService.clear({ owner: 'wf-1' })).toBe(1);
    expect(await CacheService.clear()).toBe(1);
    expect(await CacheService.stats()).toMatchObject({ count: 0, sizeBytes: 0 });
  });

  it('sweeps expired entries, then the oldest while over the size limit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
    await CacheService.set(entry('expired', 1, { ttlSeconds: 60 }));
    const chunk = 'x'.repeat(90 * 1024);
    for (const key of ['old', 'mid', 'new']) {
      vi.setSystemTime(new Date(Date.now() + 1000));
      await CacheService.set(entry(key, chunk));
    }
    vi.setSystemTime(new Date('2026-10-08T10:05:00Z'));
    // 1 MB limit, three ~90 KB entries: all fit, only the expired one goes.
    await knex('settings').insert({ key: CACHE_MAX_SIZE_SETTING, value: '1' });
    expect(await CacheService.sweep()).toBe(1);

    // Now a limit two of them don't fit under: the oldest go first.
    await knex('settings').where({ key: CACHE_MAX_SIZE_SETTING }).update({ value: '0.1' });
    await CacheService.sweep();
    expect((await CacheService.list()).map((e) => e.key)).toEqual(['new']);
  });
});

import type { Knex } from 'knex';
import type { Model, ModelClass } from 'objection';

/** What saved a version: shared by workflow and app versions. */
export type RevisionOrigin = 'edit' | 'created' | 'hub' | 'reload' | 'backup' | 'restore' | 'earlier';

export interface RevisionListItem<Summary> {
  id: number;
  origin: RevisionOrigin;
  summary: Summary | null;
  restoredFrom: number | null;
  createdAt: string;
  current: boolean;
}

// Saves of the same kind this close together become one version, so a builder session
// of many small saves doesn't fill the list.
export const MERGE_WINDOW_MS = 2 * 60 * 1000;
// Every version from the last KEEP_ALL_DAYS is kept; older ones thin out to the last
// one of each day.
export const KEEP_ALL_DAYS = 30;
const MERGEABLE: RevisionOrigin[] = ['edit'];

export const parseSource = (source: string | null | undefined): any => {
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
};

// SQLite's CURRENT_TIMESTAMP ("2026-10-24 10:00:00", UTC) as ISO.
const toIso = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
};

export interface RevisionRow {
  id: number;
  source: string;
  origin: RevisionOrigin;
  summary: string | null;
  restored_from: number | null;
  created_at: string;
}

/**
 * Saved versions of a source, kept in a `<kind>_revision` table whose rows point at
 * their owner through `ownerKey` (`task_id`, `app_id`). Workflows and apps share this;
 * each gives its own `summarize`, which says what changed from the version before.
 */
export class RevisionHistory<Summary> {
  constructor(
    private readonly model: ModelClass<Model>,
    private readonly ownerKey: string,
    private readonly summarize: (previous: string | null | undefined, next: string) => Summary | null
  ) {}

  private query(trx?: Knex.Transaction) {
    return this.model.query(trx) as any;
  }

  /**
   * Records `source` as the newest version. Call it with the owner as it was before the
   * write (`owner.source`), so an item from before version history keeps that as its
   * first, "earlier" version. Nothing is recorded when the source didn't change.
   */
  async record(
    owner: { id: number; source?: string | null; updated_at?: unknown },
    source: string,
    origin: RevisionOrigin,
    options: { restoredFrom?: number; trx?: Knex.Transaction } = {}
  ) {
    const { trx } = options;
    const where = { [this.ownerKey]: owner.id };
    const now = new Date().toISOString();

    const latest: RevisionRow | undefined = await this.query(trx).where(where).orderBy('id', 'desc').first();
    const previous = owner.source ?? null;

    if (!latest && previous && previous !== source) {
      await this.query(trx).insert({
        ...where,
        source: previous,
        origin: 'earlier',
        summary: null,
        restored_from: null,
        created_at: toIso(owner.updated_at),
      });
    }
    if (latest?.source === source) return;

    const merge =
      latest &&
      MERGEABLE.includes(origin) &&
      latest.origin === origin &&
      Date.now() - new Date(latest.created_at).getTime() < MERGE_WINDOW_MS;

    if (merge) {
      // Compared with the version before the merged one, so the summary covers the
      // whole burst of saves.
      const before: RevisionRow | undefined = await this.query(trx)
        .where(where)
        .where('id', '<', latest.id)
        .orderBy('id', 'desc')
        .first();
      const summary = before ? this.summarize(before.source, source) : null;
      await this.query(trx)
        .findById(latest.id)
        .patch({ source, summary: summary ? JSON.stringify(summary) : null, created_at: now });
    } else {
      const base = latest?.source ?? previous;
      const summary = base ? this.summarize(base, source) : null;
      await this.query(trx).insert({
        ...where,
        source,
        origin,
        summary: summary ? JSON.stringify(summary) : null,
        restored_from: options.restoredFrom ?? null,
        created_at: now,
      });
    }

    await this.prune(owner.id, trx);
  }

  /** Older than KEEP_ALL_DAYS: keeps the last version of each day. The newest is always kept. */
  async prune(ownerId: number, trx?: Knex.Transaction) {
    const where = { [this.ownerKey]: ownerId };
    const cutoff = new Date(Date.now() - KEEP_ALL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const old: { id: number; created_at: string }[] = await this.query(trx)
      .where(where)
      .where('created_at', '<', cutoff)
      .select('id', 'created_at')
      .orderBy('id', 'asc');
    if (!old.length) return;

    const newest = await this.query(trx).where(where).max('id as id').first();
    const lastOfDay = new Map<string, number>();
    for (const row of old) lastOfDay.set(row.created_at.slice(0, 10), row.id);
    const keep = new Set([...lastOfDay.values(), newest?.id]);
    const drop = old.filter((row) => !keep.has(row.id)).map((row) => row.id);
    if (drop.length) await this.query(trx).whereIn('id', drop).delete();
  }

  async list(ownerId: number): Promise<RevisionListItem<Summary>[]> {
    const rows: RevisionRow[] = await this.query()
      .where({ [this.ownerKey]: ownerId })
      .select('id', 'origin', 'summary', 'restored_from', 'created_at')
      .orderBy('id', 'desc');
    return rows.map((row, i) => ({
      id: row.id,
      origin: row.origin,
      summary: parseSource(row.summary),
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      current: i === 0,
    }));
  }

  async get(ownerId: number, revisionId: number): Promise<RevisionRow | undefined> {
    return await this.query().findOne({ id: revisionId, [this.ownerKey]: ownerId });
  }
}

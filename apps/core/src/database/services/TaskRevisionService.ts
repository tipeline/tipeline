import type { Knex } from 'knex';
import { TaskRevision, type RevisionOrigin } from '@database/models/TaskRevision';

/** What changed from the version before, shown on each row of the Versions tab. */
export interface RevisionSummary {
  added: string[]; // step labels ("http.request"), at most SUMMARY_NAMES of them
  removed: string[];
  addedCount: number;
  removedCount: number;
  changed: number; // steps kept but edited (or moved)
  variables: boolean;
  details: boolean; // name, description, tags, cache, …
}

export interface RevisionListItem {
  id: number;
  origin: RevisionOrigin;
  summary: RevisionSummary | null;
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
const SUMMARY_NAMES = 5;
const MERGEABLE: RevisionOrigin[] = ['edit'];

const parse = (source: string | null | undefined): any => {
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

const stepLabel = (step: any) => [step?.group, step?.name].filter(Boolean).join('.') || '?';

/**
 * Steps matched by their `identifier` (set by the builder) when they have one,
 * otherwise by group.name and how many of those came before.
 */
const stepKeys = (actions: any[]) => {
  const seen = new Map<string, number>();
  return actions.map((step) => {
    if (typeof step?.identifier === 'string' && step.identifier) return `id:${step.identifier}`;
    const label = stepLabel(step);
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    return `${label}#${n}`;
  });
};

/**
 * Saved versions of a workflow's source (`task_revision`). TaskService records one on
 * every write of a source, so the builder, metadata edits, hub updates, reloads from
 * file and backup restores all show up in the Versions tab.
 */
export class TaskRevisionService {
  static summarize(previous: string | null | undefined, next: string): RevisionSummary | null {
    const before = parse(previous);
    const after = parse(next);
    if (!before || !after) return null;

    const beforeSteps: any[] = Array.isArray(before.pipeline?.actions) ? before.pipeline.actions : [];
    const afterSteps: any[] = Array.isArray(after.pipeline?.actions) ? after.pipeline.actions : [];
    const beforeKeys = stepKeys(beforeSteps);
    const afterKeys = stepKeys(afterSteps);
    const beforeByKey = new Map(beforeKeys.map((key, i) => [key, { step: beforeSteps[i], index: i }]));
    const afterSet = new Set(afterKeys);

    const added: string[] = [];
    let changed = 0;
    afterKeys.forEach((key, i) => {
      const old = beforeByKey.get(key);
      if (!old) added.push(stepLabel(afterSteps[i]));
      else if (old.index !== i || JSON.stringify(old.step) !== JSON.stringify(afterSteps[i])) changed++;
    });
    const removed = beforeKeys.filter((key) => !afterSet.has(key)).map((key) => stepLabel(beforeByKey.get(key)!.step));

    const rest = (source: any) => {
      const { pipeline, ...details } = source;
      return JSON.stringify(details);
    };

    return {
      added: added.slice(0, SUMMARY_NAMES),
      removed: removed.slice(0, SUMMARY_NAMES),
      addedCount: added.length,
      removedCount: removed.length,
      changed,
      variables: JSON.stringify(before.pipeline?.variables ?? []) !== JSON.stringify(after.pipeline?.variables ?? []),
      details: rest(before) !== rest(after),
    };
  }

  /**
   * Records `source` as the workflow's newest version. Call it with the source the
   * workflow had before the write (`previous`), so a workflow from before version
   * history keeps that as its first, "earlier" version. Nothing is recorded when the
   * source didn't change.
   */
  static async record(
    task: { id: number; source?: string | null; updated_at?: unknown },
    source: string,
    origin: RevisionOrigin,
    options: { restoredFrom?: number; trx?: Knex.Transaction } = {}
  ) {
    const { trx } = options;
    const query = () => TaskRevision.query(trx);
    const now = new Date().toISOString();

    const latest = await query().where({ task_id: task.id }).orderBy('id', 'desc').first();
    const previous = task.source ?? null;

    if (!latest && previous && previous !== source) {
      await query().insert({
        task_id: task.id,
        source: previous,
        origin: 'earlier',
        summary: null,
        restored_from: null,
        created_at: toIso(task.updated_at),
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
      const before = await query().where({ task_id: task.id }).where('id', '<', latest.id).orderBy('id', 'desc').first();
      const summary = before ? this.summarize(before.source, source) : null;
      await query()
        .findById(latest.id)
        .patch({ source, summary: summary ? JSON.stringify(summary) : null, created_at: now });
    } else {
      const base = latest?.source ?? previous;
      const summary = base ? this.summarize(base, source) : null;
      await query().insert({
        task_id: task.id,
        source,
        origin,
        summary: summary ? JSON.stringify(summary) : null,
        restored_from: options.restoredFrom ?? null,
        created_at: now,
      });
    }

    await this.prune(task.id, trx);
  }

  /** Older than KEEP_ALL_DAYS: keeps the last version of each day. The newest is always kept. */
  static async prune(taskId: number, trx?: Knex.Transaction) {
    const cutoff = new Date(Date.now() - KEEP_ALL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const old = await TaskRevision.query(trx)
      .where({ task_id: taskId })
      .where('created_at', '<', cutoff)
      .select('id', 'created_at')
      .orderBy('id', 'asc');
    if (!old.length) return;

    const newest = await TaskRevision.query(trx).where({ task_id: taskId }).max('id as id').first();
    const lastOfDay = new Map<string, number>();
    for (const row of old) lastOfDay.set(row.created_at.slice(0, 10), row.id);
    const keep = new Set([...lastOfDay.values(), (newest as any)?.id]);
    const drop = old.filter((row) => !keep.has(row.id)).map((row) => row.id);
    if (drop.length) await TaskRevision.query(trx).whereIn('id', drop).delete();
  }

  static async list(taskId: number): Promise<RevisionListItem[]> {
    const rows = await TaskRevision.query()
      .where({ task_id: taskId })
      .select('id', 'origin', 'summary', 'restored_from', 'created_at')
      .orderBy('id', 'desc');
    return rows.map((row, i) => ({
      id: row.id,
      origin: row.origin,
      summary: parse(row.summary),
      restoredFrom: row.restored_from,
      createdAt: row.created_at,
      current: i === 0,
    }));
  }

  static async get(taskId: number, revisionId: number) {
    return await TaskRevision.query().findOne({ id: revisionId, task_id: taskId });
  }
}

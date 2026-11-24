import type { Knex } from 'knex';
import { generateIdentifier } from '@tipeline/utils';
import type { AlertLevel } from '@tipeline/schemas';
import { Alert, type AlertStatus } from '@database/models/Alert';

/** Closed alerts are kept this long, then pruned. */
export const ALERT_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

/** Statuses a raise with the same key continues (a dismissed alert is only acknowledged). */
const CONTINUED: AlertStatus[] = ['open', 'dismissed'];

const LEVEL_RANK: Record<AlertLevel, number> = { info: 0, warning: 1, critical: 2 };

export interface RaiseInput {
  taskIdentifier: string;
  pipelineIdentifier?: string | null;
  key: string;
  title: string;
  message?: string | null;
  level: AlertLevel;
}

export interface AlertItem {
  id: string;
  taskIdentifier: string;
  workflowName: string | null;
  pipelineIdentifier: string | null;
  key: string;
  title: string;
  message: string | null;
  level: AlertLevel;
  status: AlertStatus;
  count: number;
  firstRaisedAt: string;
  lastRaisedAt: string;
  closedAt: string | null;
  closedBy: string | null;
}

export interface AlertListQuery {
  /** Also dismissed (acknowledged) and resolved alerts. */
  includeClosed?: boolean;
  taskIdentifier?: string;
  ids?: string[];
}

const toItem = (row: any): AlertItem => ({
  id: row.identifier,
  taskIdentifier: row.task_identifier,
  workflowName: row.task_name ?? null,
  pipelineIdentifier: row.pipeline_identifier ?? null,
  key: row.key,
  title: row.title,
  message: row.message ?? null,
  level: row.level,
  status: row.status,
  count: Number(row.count ?? 1),
  firstRaisedAt: row.first_raised_at,
  lastRaisedAt: row.last_raised_at,
  closedAt: row.closed_at ?? null,
  closedBy: row.closed_by ?? null,
});

/**
 * Alerts raised by workflows. One alert per workflow and key stays open across runs:
 * raising it again counts up and points it at the latest run. Dismissing only
 * acknowledges it (later raises keep it quiet); alert.resolve closes it for good.
 */
export class AlertService {
  private static lastPrune = 0;

  /**
   * Creates the alert, or updates this workflow's open or acknowledged one with this key.
   * An acknowledged alert stays quiet unless it's raised louder than it was (a warning
   * now raised as critical): then it's back in Needs you, since that wasn't what was seen.
   */
  static async raise(input: RaiseInput): Promise<{ alert: AlertItem; isNew: boolean }> {
    const now = new Date().toISOString();
    return await Alert.transaction(async (trx) => {
      const existing = await Alert.query(trx)
        .where({ task_identifier: input.taskIdentifier, key: input.key })
        .whereIn('status', CONTINUED)
        .orderBy('id', 'desc')
        .first();

      if (existing) {
        const louder =
          existing.status === 'dismissed' &&
          (LEVEL_RANK[input.level] ?? 0) > (LEVEL_RANK[existing.level] ?? 0);
        await Alert.query(trx)
          .findById(existing.id)
          .patch({
            ...(louder ? { status: 'open', closed_at: null, closed_by: null } : {}),
            title: input.title,
            message: input.message ?? null,
            level: input.level,
            count: existing.count + 1,
            pipeline_identifier: input.pipelineIdentifier ?? null,
            last_raised_at: now,
          } as any);
        const row = await Alert.query(trx).findById(existing.id);
        return { alert: toItem(row), isNew: false };
      }

      const row = await Alert.query(trx).insertAndFetch({
        identifier: generateIdentifier(),
        task_identifier: input.taskIdentifier,
        pipeline_identifier: input.pipelineIdentifier ?? null,
        key: input.key,
        title: input.title,
        message: input.message ?? null,
        level: input.level,
        status: 'open',
        count: 1,
        first_raised_at: now,
        last_raised_at: now,
      } as any);
      return { alert: toItem(row), isNew: true };
    });
  }

  /** Closes this workflow's open or acknowledged alert with this key. True if there was one. */
  static async resolve(
    taskIdentifier: string,
    key: string,
    by: string | null = null
  ): Promise<boolean> {
    const count = await Alert.query()
      .where({ task_identifier: taskIdentifier, key })
      .whereIn('status', CONTINUED)
      .patch({ status: 'resolved', closed_at: new Date().toISOString(), closed_by: by } as any);
    return count > 0;
  }

  /** Open alerts, newest raise first (with includeClosed, all that are kept). */
  static async list(query: AlertListQuery = {}): Promise<AlertItem[]> {
    await this.pruneOccasionally();
    let q = Alert.knex()('alert')
      .leftJoin('task', 'task.identifier', 'alert.task_identifier')
      .select('alert.*', 'task.name as task_name')
      .orderBy('alert.last_raised_at', 'desc')
      .orderBy('alert.id', 'desc');
    if (!query.includeClosed) q = q.where('alert.status', 'open');
    if (query.taskIdentifier) q = q.where('alert.task_identifier', query.taskIdentifier);
    if (query.ids) q = q.whereIn('alert.identifier', query.ids);
    return (await q).map(toItem);
  }

  /**
   * Acknowledges open alerts: by id(s), or every open one. Returns how many changed.
   * They stay quiet while their key keeps being raised, until resolved.
   */
  static async dismiss(
    target: { id?: string; ids?: string[]; all?: boolean },
    by: string | null = null
  ): Promise<number> {
    let q = Alert.query().where('status', 'open');
    if (!target.all) {
      const ids = [...(target.ids ?? []), ...(target.id ? [target.id] : [])];
      if (!ids.length) return 0;
      q = q.whereIn('identifier', ids);
    }
    return await q.patch({
      status: 'dismissed',
      closed_at: new Date().toISOString(),
      closed_by: by,
    } as any);
  }

  /** Puts an acknowledged alert back in Needs you. */
  static async reopen(id: string): Promise<boolean> {
    const count = await Alert.query()
      .where({ identifier: id, status: 'dismissed' })
      .patch({ status: 'open', closed_at: null, closed_by: null } as any);
    return count > 0;
  }

  /** A deleted workflow takes its alerts with it. */
  static async deleteForTask(taskIdentifier: string, trx?: Knex.Transaction): Promise<void> {
    await (trx ?? Alert.knex())('alert').where({ task_identifier: taskIdentifier }).delete();
  }

  /**
   * Drops resolved alerts closed more than 30 days ago, and acknowledged ones nobody has
   * raised for 30 days (so a workflow that never calls resolve doesn't keep a key quiet forever).
   */
  static async prune(now = Date.now()): Promise<number> {
    const before = new Date(now - ALERT_KEEP_DAYS * DAY_MS).toISOString();
    const resolved = await Alert.query()
      .where('status', 'resolved')
      .where('closed_at', '<', before)
      .delete();
    const dismissed = await Alert.query()
      .where('status', 'dismissed')
      .where('last_raised_at', '<', before)
      .delete();
    return resolved + dismissed;
  }

  private static async pruneOccasionally() {
    if (Date.now() - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastPrune = Date.now();
    try {
      await this.prune();
    } catch (error) {
      console.warn('[alert] prune failed:', error);
    }
  }
}

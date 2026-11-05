import { Pipeline as PipelineModel } from '@/database/models/Pipeline';
import { PipelineVariableService } from './PipelineVariableService';
import { PipelineAction as PipelineActionModel } from '@/database/models/PipelineAction';
import { generateIdentifier } from '@tipeline/utils';
export class PipelineService {
  static async create(
    task_id: number,
    status: PipelineModel['status'],
    options: {
      metadata?: any;
      startedAt?: Date | null;
      source?: any;
    }
  ) {
    const { metadata, startedAt, source } = options;

    const insertData: Record<string, any> = {
      task_id,
      identifier: generateIdentifier(),
      status,
      metadata: metadata !== undefined ? metadata : undefined,
      source: source ?? undefined,
    };

    if (startedAt) insertData.started_at = startedAt.toISOString();

    return await PipelineModel.query().insert(insertData);
  }

  static async updateStatus(
    id: number,
    status: PipelineModel['status'],
    options: {
      metadata?: any;
      startedAt?: Date | null;
      finishedAt?: Date | null;
    } = {}
  ) {
    const { metadata, startedAt, finishedAt } = options;

    const patchData: Record<string, any> = { status };
    // Merge into what's there — a status change must not erase metadata recorded
    // earlier in the run (e.g. which app triggered it).
    if (metadata !== undefined) {
      const current = await PipelineModel.query().findById(id).select('metadata');
      patchData.metadata = { ...(current?.metadata ?? {}), ...metadata };
    }

    if (startedAt !== undefined) patchData.started_at = startedAt ? startedAt.toISOString() : null;
    if (finishedAt !== undefined)
      patchData.finished_at = finishedAt ? finishedAt.toISOString() : null;

    // return await PipelineModel.query().patch({ status }).where({ id }).returning('*');
    const count = await PipelineModel.query().where({ id }).patch(patchData);
    if (count === 0) throw new Error(`Pipeline ${id} not found`);
    // A completed run can't resume, so nothing needs its secrets any more.
    if (status === 'completed') await PipelineVariableService.eraseSecrets(id);
    return await PipelineModel.query().findById(id);
  }

  // static async markCompleted(id: number) {
  //   return await PipelineModel.query()
  //     .patch({ status: 'completed', finished_at: new Date().toISOString() })
  //     .where({ id });
  // }

  /** Shallow-merges `patch` into a pipeline's metadata (a null value removes the key). */
  static async mergeMetadata(id: number, patch: Record<string, unknown>) {
    const current = await PipelineModel.query().findById(id).select('metadata');
    const metadata: Record<string, unknown> = { ...(current?.metadata ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete metadata[key];
      else metadata[key] = value;
    }
    await PipelineModel.query().findById(id).patch({ metadata } as any);
    return metadata;
  }

  /** Runs a Core restart would interrupt, including paused ones. */
  static async countActive(): Promise<number> {
    return await PipelineModel.query().whereIn('status', ['running', 'paused']).resultSize();
  }

  /** Paused runs waiting for an approval decision, newest first. */
  static async getPendingApprovals(taskIdentifiers?: string[]) {
    let query = PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .where('pipeline.status', 'paused')
      .whereRaw(`json_extract(pipeline.metadata, '$.approval') is not null`)
      .select('pipeline.id', 'pipeline.identifier', 'pipeline.metadata', 'pipeline.started_at', 'task.identifier as task_identifier', 'task.name as task_name')
      .orderBy('pipeline.started_at', 'desc');
    if (taskIdentifiers) query = query.whereIn('task.identifier', taskIdentifiers);
    return await query;
  }

  /** The most recent runs that recorded approval decisions (optionally only these workflows). */
  static async getDecidedApprovals(taskIdentifiers: string[] | undefined, limit: number) {
    let query = PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .whereRaw(`json_extract(pipeline.metadata, '$.approvals') is not null`)
      .select('pipeline.id', 'pipeline.identifier', 'pipeline.status', 'pipeline.metadata', 'pipeline.started_at', 'task.identifier as task_identifier', 'task.name as task_name')
      .orderBy('pipeline.started_at', 'desc')
      .limit(limit);
    if (taskIdentifiers) query = query.whereIn('task.identifier', taskIdentifiers);
    return await query;
  }

  /** Runs a run's sub-workflow steps started (their `parent` metadata), oldest first. */
  static async getChildRuns(pipelineIdentifier: string) {
    const rows = await PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .whereRaw(`json_extract(pipeline.metadata, '$.parent.pipelineIdentifier') = ?`, [pipelineIdentifier])
      .select('pipeline.identifier', 'pipeline.status', 'pipeline.started_at', 'pipeline.finished_at', 'pipeline.metadata', 'task.identifier as task_identifier', 'task.name as task_name')
      .orderBy('pipeline.started_at', 'asc')
      .orderBy('pipeline.id', 'asc');
    return rows.map((row: any) => {
      const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      return {
        identifier: row.identifier as string,
        status: row.status as string,
        started_at: row.started_at as string,
        finished_at: (row.finished_at ?? null) as string | null,
        taskIdentifier: row.task_identifier as string,
        taskName: row.task_name as string,
        stepIdentifier: (metadata?.parent?.stepIdentifier ?? null) as string | null,
      };
    });
  }

  /** Moves a paused run back to running exactly once — false if someone else already did. */
  static async claimPaused(id: number): Promise<boolean> {
    const count = await PipelineModel.query().where({ id, status: 'paused' }).patch({ status: 'running' } as any);
    return count > 0;
  }

  /**
   * Ends a run that isn't executing (waiting for an approval, or left running by a core
   * that stopped) as canceled, exactly once — false if it was no longer in one of
   * `from`. Its waiting step is canceled too, and a pending approval is withdrawn.
   */
  static async cancelIdle(
    id: number,
    from: Array<PipelineModel['status']>,
    metadata: Record<string, unknown>
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const count = await PipelineModel.query()
      .where({ id })
      .whereIn('status', from)
      .patch({ status: 'canceled', finished_at: now } as any);
    if (count === 0) return false;
    await PipelineService.mergeMetadata(id, { ...metadata, approval: null });
    await PipelineActionModel.query()
      .where({ pipeline_id: id })
      .whereIn('status', ['paused', 'running'])
      .patch({ status: 'canceled', finished_at: now } as any);
    return true;
  }

  /**
   * Runs whose job is gone but that still say running — their worker crashed, so nothing
   * else will ever end them: they and their running steps end as failed, saying why.
   * Returns the identifiers it ended.
   */
  static async failAbandoned(identifiers: string[], message: string): Promise<string[]> {
    if (identifiers.length === 0) return [];
    const runs = await PipelineModel.query()
      .select('id', 'identifier')
      .whereIn('identifier', identifiers)
      .where('status', 'running');
    if (runs.length === 0) return [];
    const ids = runs.map((run) => run.id);
    const now = new Date().toISOString();
    await PipelineModel.query()
      .whereIn('id', ids)
      .where('status', 'running')
      .patch({ status: 'failed', finished_at: now } as any);
    for (const id of ids) {
      await PipelineService.mergeMetadata(id, { reason: 'worker_exit', message });
    }
    await PipelineActionModel.query()
      .whereIn('pipeline_id', ids)
      .where('status', 'running')
      .patch({ status: 'failed', error: message, finished_at: now } as any);
    return runs.map((run) => run.identifier);
  }

  static async getById(id: number) {
    return await PipelineModel.query().findById(id);
  }

  static async getByIdentifier(identifier: string) {
    return await PipelineModel.query().findOne({ identifier });
  }

  static async getAll() {
    return await PipelineModel.query()
      .select('identifier', 'status', 'started_at', 'finished_at')
      .orderBy('started_at', 'desc')
      .limit(100);
  }

  /**
   * How many runs started in each period, and how many of those failed. `boundaries` are
   * ascending ISO instants, n + 1 of them for n periods, so the caller decides where its
   * days start in its own time zone. Runs that never started (pending) aren't counted.
   */
  static async countsByPeriod(boundaries: string[]) {
    if (boundaries.length < 2) return [];
    const rows = await PipelineModel.query()
      .select('status', 'started_at')
      .where('started_at', '>=', boundaries[0])
      .where('started_at', '<', boundaries[boundaries.length - 1]);
    const periods = boundaries.slice(0, -1).map((from, i) => ({ from, to: boundaries[i + 1], total: 0, failed: 0 }));
    for (const row of rows as { status: string; started_at: string }[]) {
      // Stored as toISOString(), so plain string order is time order.
      const period = periods.find((p) => row.started_at >= p.from && row.started_at < p.to);
      if (!period) continue;
      period.total++;
      if (row.status === 'failed') period.failed++;
    }
    return periods;
  }

  /** `status` filters in the query, so a page of failed runs isn't cut from the newest runs. */
  static async getAllWithTaskName(limit = 100, offset = 0, status?: string) {
    const query = PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .select(
        'pipeline.identifier',
        'pipeline.status',
        'pipeline.started_at',
        'pipeline.finished_at',
        'pipeline.metadata',
        'task.name as task_name',
        'task.identifier as task_identifier'
      )
      .orderBy('pipeline.started_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query.where('pipeline.status', status);
    return await query;
  }

  static async getFilteredByTask(
    taskId: number,
    filterMode: 'latest' | 'byId' | 'dateRange' | 'range',
    opts: { pipelineIdentifier?: string; dateFrom?: string; dateTo?: string; count?: number }
  ) {
    const base = PipelineModel.query().where('pipeline.task_id', taskId);

    if (filterMode === 'byId') {
      const p = await base.findOne({ 'pipeline.identifier': opts.pipelineIdentifier });
      return p ? [p] : [];
    }
    if (filterMode === 'dateRange') {
      // started_at is an ISO instant. A bare date covers that whole (UTC) day, so a
      // "to" date includes its own day; apps send exact instants for the user's zone.
      const dayOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      const from = opts.dateFrom && dayOnly(opts.dateFrom) ? `${opts.dateFrom}T00:00:00.000Z` : opts.dateFrom;
      const to = opts.dateTo && dayOnly(opts.dateTo) ? `${opts.dateTo}T23:59:59.999Z` : opts.dateTo;
      let query = base;
      if (from) query = query.where('pipeline.started_at', '>=', from);
      if (to) query = query.where('pipeline.started_at', '<=', to);
      return await query.orderBy('pipeline.started_at', 'desc');
    }
    if (filterMode === 'range') {
      return await base.orderBy('pipeline.started_at', 'desc').limit(opts.count ?? 10);
    }
    // latest
    const p = await base.orderBy('pipeline.started_at', 'desc').first();
    return p ? [p] : [];
  }

  /** Runs of several workflows, newest first — optionally only some statuses. */
  static async getByTaskIdentifiers(
    taskIdentifiers: string[],
    opts: { statuses?: string[]; limit?: number } = {}
  ) {
    if (!taskIdentifiers.length) return [];
    const query = PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .whereIn('task.identifier', taskIdentifiers)
      .select(
        'pipeline.identifier',
        'pipeline.status',
        'pipeline.started_at',
        'pipeline.finished_at',
        'pipeline.metadata',
        'task.name as task_name',
        'task.identifier as task_identifier'
      )
      .orderBy('pipeline.started_at', 'desc')
      .orderBy('pipeline.id', 'desc')
      .limit(opts.limit ?? 20);
    if (opts.statuses?.length) query.whereIn('pipeline.status', opts.statuses);
    return await query;
  }

  static async getByTaskIdentifier(taskIdentifier: string, limit = 100, offset = 0, status?: string) {
    const query = PipelineModel.query()
      .join('task', 'pipeline.task_id', 'task.id')
      .where('task.identifier', taskIdentifier)
      .select(
        'pipeline.identifier',
        'pipeline.status',
        'pipeline.started_at',
        'pipeline.finished_at',
        'pipeline.metadata'
      )
      .orderBy('pipeline.started_at', 'desc')
      .limit(limit)
      .offset(offset);
    if (status) query.where('pipeline.status', status);
    return await query;
  }

  static async deleteAllForTask(taskId: number): Promise<string[]> {
    const eligible = await PipelineModel.query()
      .where({ task_id: taskId })
      .whereNot('status', 'running')
      .select('id', 'identifier');
    if (eligible.length === 0) return [];

    await PipelineModel.query().whereIn('id', eligible.map((p) => p.id)).delete();
    return eligible.map((p) => p.identifier);
  }

  /** Deletes these runs, skipping any still running. Returns the identifiers deleted. */
  static async deleteByIdentifiers(identifiers: string[]): Promise<string[]> {
    if (identifiers.length === 0) return [];
    const eligible = await PipelineModel.query()
      .whereIn('identifier', identifiers)
      .whereNot('status', 'running')
      .select('id', 'identifier');
    if (eligible.length === 0) return [];

    await PipelineModel.query().whereIn('id', eligible.map((p) => p.id)).delete();
    return eligible.map((p) => p.identifier);
  }

  /**
   * Deletes finished runs started before `cutoff`, a little at a time so runs in progress can
   * still write. Paused and running ones stay, and so does each workflow's latest run, which
   * its Overview still shows however long ago it was. Returns how many went.
   */
  static async deleteFinishedBefore(cutoff: string): Promise<number> {
    const knex = PipelineModel.knex();
    let deleted = 0;
    for (;;) {
      const ids: number[] = await knex('pipeline')
        .whereIn('status', ['completed', 'failed', 'canceled'])
        .where('started_at', '<', cutoff)
        .whereNotIn('id', knex('pipeline').max('id').groupBy('task_id'))
        .limit(200)
        .pluck('id');
      if (ids.length === 0) return deleted;
      await PipelineModel.query().whereIn('id', ids).delete();
      deleted += ids.length;
    }
  }

  static async deleteAll(): Promise<string[]> {
    const eligible = await PipelineModel.query()
      .whereNot('status', 'running')
      .select('id', 'identifier');
    if (eligible.length === 0) return [];

    await PipelineModel.query().whereIn('id', eligible.map((p) => p.id)).delete();
    return eligible.map((p) => p.identifier);
  }

  static async getByIdentifierWithActions(pipelineIdentifier: string) {
    // Action 1: Get the most recent pipeline by its identifier
    const pipeline = await PipelineModel.query()
      .where('identifier', pipelineIdentifier)
      .orderBy('started_at', 'desc')
      .first();

    if (!pipeline) {
      return null; // Pipeline not found
    }

    // Action 2: Fetch the pipeline with all its actions, plus each action's
    // block (carries `iteration` — needed to tell repeated loop-body actions
    // apart instead of collapsing them to a single row by identifier).
    const pipelineData = await PipelineModel.query()
      .findById(pipeline.id)
      .withGraphFetched('[actions.block, task]')
      .modifyGraph('actions', (builder) => {
        // Execution order; steps that haven't started yet come last.
        builder.orderByRaw('started_at IS NULL, started_at ASC, id ASC');
      })
      // Which workflow ran — e.g. for the server to check who may act on the run. Not
      // its source.
      .modifyGraph('task', (builder) => {
        builder.select('id', 'identifier', 'name');
      });

    return pipelineData;
  }
}

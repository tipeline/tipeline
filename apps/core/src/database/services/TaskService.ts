import { hubUpdateState } from '@/hub/HubUpdatePolicy';
import { Task as TaskModel } from '@/database/models/Task';
import { TaskHubLink } from '@/database/models/TaskHubLink';
import { TagService } from '@/database/services/TagService';
import { TaskRevisionService } from '@/database/services/TaskRevisionService';
import type { RevisionOrigin } from '@/database/models/TaskRevision';
import { generateIdentifier } from '@tipeline/utils';
import { ProjectMembership, parseProjects, projectsSubquery } from '@/database/services/ProjectMembership';

const TASK_TAGS_SUBQUERY = `(
  SELECT COALESCE(json_group_array(tag.label), '[]')
  FROM task_tag
  JOIN tag ON tag.id = task_tag.tag_id
  WHERE task_tag.task_id = task.id
) as tags`;

// Every query that lists/details a task computes this instead of reading a
// stored column — 'hub' iff a task_hub_link row exists, fully redundant
// otherwise. Keep this expression identical everywhere it's used.
const SOURCE_TYPE_CASE = `CASE WHEN thl.id IS NOT NULL THEN 'hub' ELSE 'local' END`;

type LocalInstallData = {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  platform?: 'windows' | 'linux' | 'macos';
  tags?: string[];
  metadata?: any;
  source?: string;
};

type HubInstallData = LocalInstallData & {
  hub_id: string;
  hub_user?: string;
  hub_task_identifier: string;
  hub_version: string;
  auto_update?: boolean;
};

export class TaskService {
  static async install(data: LocalInstallData) {
    const record = await TaskModel.query().insert({
      identifier: generateIdentifier(),
      name: data.name,
      description: data.description,
      author: data.author,
      version: data.version,
      platform: data.platform,
      metadata: data.metadata,
      source: data.source,
    });
    if (data.source) await TaskRevisionService.record({ id: record.id }, data.source, 'created');

    const normalizedTags = TagService.normalizeLabels(data.tags ?? []);
    const tagIds = await TagService.findOrCreateIds(normalizedTags);
    await TagService.setTaskTags(record.id, tagIds);

    return { ...record, tags: normalizedTags };
  }

  /**
   * The workflow previously installed from a given bundled workflow file — an app's
   * `workflows: { alias: { file } }` entry — matched by the fingerprint of the file's
   * contents (see Core.appInstall). Lets installing a second app that ships the same
   * workflow reuse it instead of installing a duplicate.
   */
  static async getByBundleFingerprint(fingerprint: string) {
    return await TaskModel.query()
      .whereRaw(`json_extract(metadata, '$.bundleFingerprint') = ?`, [fingerprint])
      .orderBy('id')
      .first();
  }

  static async installFromHub(data: HubInstallData) {
    const record = await TaskModel.transaction(async (trx) => {
      const task = await TaskModel.query(trx).insert({
        identifier: generateIdentifier(),
        name: data.name,
        description: data.description,
        author: data.author,
        version: data.version,
        platform: data.platform,
        metadata: data.metadata,
        source: data.source,
      });

      await TaskHubLink.query(trx).insert({
        task_id: task.id,
        hub_id: data.hub_id,
        hub_user: data.hub_user,
        hub_task_identifier: data.hub_task_identifier,
        hub_version: data.hub_version,
        hub_status: 'ok',
        auto_update: data.auto_update ?? true,
        last_synced_at: new Date().toISOString(),
      } as any);

      if (data.source) await TaskRevisionService.record({ id: task.id }, data.source, 'hub', { trx });

      return task;
    });

    const normalizedTags = TagService.normalizeLabels(data.tags ?? []);
    const tagIds = await TagService.findOrCreateIds(normalizedTags);
    await TagService.setTaskTags(record.id, tagIds);

    return TaskService.getByIdentifier(record.identifier);
  }

  static async uninstall(identifier: string) {
    const row = await TaskModel.query().findOne({ identifier }).select('id');
    if (!row) throw new Error(`Workflow "${identifier}" not found`);
    const count = await TaskModel.query().delete().where({ id: row.id });
    await ProjectMembership.forget('task', row.id);
    return count;
  }

  static async getAll() {
    const knex = TaskModel.knex();
    const rows = await knex('task')
      .leftJoin('task_hub_link as thl', 'thl.task_id', 'task.id')
      .select(
        'task.identifier',
        'task.name',
        'task.description',
        'task.author',
        'task.version',
        'task.platform',
        knex.raw(`json_extract(task.metadata, '$.image') as image`),
        knex.raw(`json_extract(task.metadata, '$.draft') as draft`),
        knex.raw(`json_extract(task.metadata, '$.draftSchedule') as draftSchedule`),
        // Lives in the workflow file, not metadata: it travels with exports and hub installs.
        knex.raw(`json_extract(task.source, '$.helper') as helper`),
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'thl.hub_id',
        'thl.hub_task_identifier',
        'thl.hub_version',
        'task.created_at',
        knex.raw(`${TASK_TAGS_SUBQUERY}`),
        knex.raw(projectsSubquery('task')),
        knex.raw(`(
          SELECT status FROM pipeline
          WHERE task_id = task.id
          ORDER BY started_at DESC
          LIMIT 1
        ) as last_run_status`),
        knex.raw(`(
          SELECT started_at FROM pipeline
          WHERE task_id = task.id
          ORDER BY started_at DESC
          LIMIT 1
        ) as last_run_at`),
        knex.raw(`(
          SELECT identifier FROM pipeline
          WHERE task_id = task.id
          ORDER BY started_at DESC
          LIMIT 1
        ) as last_run_identifier`),
        // The last ten runs' statuses, newest first: the strip on the Workflows list.
        knex.raw(`(
          SELECT json_group_array(status) FROM (
            SELECT status FROM pipeline
            WHERE task_id = task.id AND started_at IS NOT NULL
            ORDER BY started_at DESC
            LIMIT 10
          )
        ) as recent_runs`)
      )
      .orderBy('task.created_at', 'desc');

    return rows.map((row) => ({
      ...row,
      tags: JSON.parse(row.tags),
      projects: parseProjects(row.projects),
      recent_runs: row.recent_runs ? JSON.parse(row.recent_runs) : [],
    }));
  }

  static async getAllWithSource(): Promise<
    { identifier: string; name: string; source: string | null; metadata?: Record<string, any> | null }[]
  > {
    return await TaskModel.query().select('identifier', 'name', 'source', 'metadata') as any;
  }

  static async getByIdentifier(identifier: string) {
    const knex = TaskModel.knex();
    const row = await knex('task')
      .leftJoin('task_hub_link as thl', 'thl.task_id', 'task.id')
      .leftJoin('hub', 'hub.id', 'thl.hub_id')
      .select(
        'task.*',
        knex.raw(projectsSubquery('task')),
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'thl.hub_id',
        'thl.hub_task_identifier',
        'thl.hub_version',
        'thl.hub_status',
        'thl.auto_update',
        'thl.last_synced_at',
        'hub.name as hub_name',
        knex.raw(`${TASK_TAGS_SUBQUERY}`)
      )
      .where('task.identifier', identifier)
      .first();

    return row
      ? {
          ...row,
          tags: JSON.parse(row.tags),
          projects: parseProjects(row.projects),
          metadata: row.metadata ? JSON.parse(row.metadata) : row.metadata,
          hub_update_state: hubUpdateState(row.version, row.hub_version),
        }
      : row;
  }

  static async getById(id: number) {
    return await TaskModel.query().findOne({ id });
  }

  static async getByHubRef(hubId: string, hubTaskIdentifier: string) {
    const knex = TaskModel.knex();
    return await knex('task')
      .innerJoin('task_hub_link as thl', 'thl.task_id', 'task.id')
      .where({ 'thl.hub_id': hubId, 'thl.hub_task_identifier': hubTaskIdentifier })
      .select('task.*', 'thl.hub_id', 'thl.hub_task_identifier', 'thl.hub_version', 'thl.hub_status', 'thl.auto_update')
      .first();
  }

  /** Every task installed from a given hub — used to detect ones whose catalog entry disappeared. */
  static async getInstalledForHub(hubId: string) {
    const knex = TaskModel.knex();
    return await knex('task_hub_link as thl')
      .innerJoin('task', 'task.id', 'thl.task_id')
      .where('thl.hub_id', hubId)
      .select(
        'task.identifier',
        'task.name',
        'task.version',
        'thl.hub_task_identifier',
        'thl.hub_version',
        'thl.auto_update',
        'thl.hub_status'
      );
  }

  static async setHubStatus(identifier: string, status: 'ok' | 'missing' | 'error') {
    const task = await TaskModel.query().findOne({ identifier }).select('id');
    if (!task) return;
    await TaskHubLink.query().patch({ hub_status: status } as any).where({ task_id: task.id });
  }

  /**
   * Applies a hub update: re-syncs the dedicated name/description/author/version/
   * platform columns and tags from the freshly-fetched `source` (same mirroring
   * `updateSource` does for a manual code-view save), plus hub_version/last_synced_at
   * on the link row.
   */
  static async markSynced(identifier: string, hubVersion: string, source: string) {
    const record = await TaskModel.query().findOne({ identifier });
    if (!record) return null;

    const parsed = JSON.parse(source);
    await TaskModel.query().findOne({ identifier }).patch({
      source,
      name: parsed.name,
      description: parsed.description,
      author: parsed.author,
      version: parsed.version,
      platform: parsed.platform,
    });
    await TaskRevisionService.record(record, source, 'hub');
    await TaskHubLink.query()
      .patch({ hub_version: hubVersion, last_synced_at: new Date().toISOString() } as any)
      .where({ task_id: record.id });

    if (parsed.tags !== undefined) {
      const normalizedTags = TagService.normalizeLabels(parsed.tags);
      const tagIds = await TagService.findOrCreateIds(normalizedTags);
      await TagService.setTaskTags(record.id, tagIds);
    }

    return TaskService.getByIdentifier(identifier);
  }

  /** Refreshes just the "latest known at hub" version, without applying anything — drives the "update available" badge when auto_update is off. */
  static async setHubVersion(identifier: string, hubVersion: string) {
    const task = await TaskModel.query().findOne({ identifier }).select('id');
    if (!task) return null;
    const count = await TaskHubLink.query().patch({ hub_version: hubVersion } as any).where({ task_id: task.id });
    if (!count) return null;
    return TaskService.getByIdentifier(identifier);
  }

  static async setAutoUpdate(identifier: string, autoUpdate: boolean) {
    const task = await TaskModel.query().findOne({ identifier }).select('id');
    if (!task) return null;
    const count = await TaskHubLink.query().patch({ auto_update: autoUpdate }).where({ task_id: task.id });
    if (!count) return null;
    return TaskService.getByIdentifier(identifier);
  }

  static async updateMeta(identifier: string, data: { name?: string; description?: string; author?: string; version?: string; platform?: 'windows' | 'linux' | 'macos'; tags?: string[] }) {
    const record = await TaskModel.query().findOne({ identifier });
    if (!record) throw new Error(`Workflow not found: ${identifier}`);

    const { tags, ...metaData } = data;

    if (Object.keys(metaData).length) {
      await TaskModel.query().findOne({ identifier }).patch(metaData);
    }

    let normalizedTags: string[] | undefined;
    if (tags !== undefined) {
      normalizedTags = TagService.normalizeLabels(tags);
      const tagIds = await TagService.findOrCreateIds(normalizedTags);
      await TagService.setTaskTags(record.id, tagIds);
    }

    if (record.source) {
      const source = JSON.parse(record.source as string);
      const patchSource: any = { ...source, ...metaData };
      if (normalizedTags !== undefined) patchSource.tags = normalizedTags;
      const next = JSON.stringify(patchSource);
      await TaskModel.query().findOne({ identifier }).patch({ source: next });
      await TaskRevisionService.record(record, next, 'edit');
    }

    return TaskService.getByIdentifier(identifier);
  }

  /** Read-modify-write of the `metadata` JSON column — the only place a Task's image lives. */
  static async updateImage(identifier: string, relativePath: string | null) {
    const record = await TaskModel.query().findOne({ identifier });
    if (!record) throw new Error(`Workflow not found: ${identifier}`);

    const metadata = { ...(record.metadata ?? {}), image: relativePath ?? undefined };
    if (relativePath === null) delete metadata.image;

    await TaskModel.query().findOne({ identifier }).patch({ metadata });
    return TaskService.getByIdentifier(identifier);
  }

  /** Marks a workflow as a draft, or as ready (see task/Draft.ts). */
  static async setDraft(identifier: string, draft: boolean) {
    const record = await TaskModel.query().findOne({ identifier });
    if (!record) throw new Error(`Workflow not found: ${identifier}`);

    const metadata = { ...(record.metadata ?? {}) };
    if (draft) metadata.draft = true;
    else {
      delete metadata.draft;
      // A proposed schedule belongs to the draft: once ready it's turned on or dropped.
      delete metadata.draftSchedule;
    }

    await TaskModel.query().findOne({ identifier }).patch({ metadata });
    return TaskService.getByIdentifier(identifier);
  }

  static async updateSource(
    identifier: string,
    source: string,
    origin: RevisionOrigin = 'edit',
    options: { restoredFrom?: number } = {}
  ) {
    const record = await TaskModel.query().findOne({ identifier });
    if (!record) return null;

    // The source blob carries its own name/description/author/version/platform/tags
    // (same fields updateMeta edits) — keep the dedicated columns in sync so
    // list/detail queries, which read those columns rather than parsing source,
    // don't go stale after a code-view save.
    const parsed = JSON.parse(source);
    await TaskModel.query().findOne({ identifier }).patch({
      source,
      name: parsed.name,
      description: parsed.description,
      author: parsed.author,
      version: parsed.version,
      platform: parsed.platform,
    });
    await TaskRevisionService.record(record, source, origin, options);

    if (parsed.tags !== undefined) {
      const normalizedTags = TagService.normalizeLabels(parsed.tags);
      const tagIds = await TagService.findOrCreateIds(normalizedTags);
      await TagService.setTaskTags(record.id, tagIds);
    }

    return TaskService.getByIdentifier(identifier);
  }

  static async reload(
    identifier: string,
    data: { name: string; description?: string; author?: string; version?: string; source: string }
  ) {
    const before = await TaskModel.query().findOne({ identifier });
    const count = await TaskModel.query()
      .patch({
        name: data.name,
        description: data.description,
        author: data.author,
        version: data.version,
        source: data.source,
      })
      .where({ identifier });
    if (!count) return null;
    if (before) await TaskRevisionService.record(before, data.source, 'reload');
    return TaskModel.query().findOne({ identifier });
  }
}

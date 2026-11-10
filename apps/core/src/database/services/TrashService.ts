import type { Knex } from 'knex';
import { Model } from 'objection';
import { TagService } from '@database/services/TagService';
import { ProjectMembership } from '@database/services/ProjectMembership';

export type TrashKind = 'task' | 'app';

/** How long a deleted workflow or app stays in the Trash. */
export const TRASH_KEEP_DAYS = 30;

/**
 * What a trash item holds: the row and what goes with it, as stored. Ids are left out
 * of the related rows; a restore gives them new ones.
 */
interface TrashData {
  row: Record<string, any>;
  /** Every project it was in, by identifier. */
  projects?: string[];
  /** Items trashed before a workflow could be in several projects. */
  project?: string | null;
  tags?: string[];
  hubLink: Record<string, any> | null;
  revisions?: Record<string, any>[]; // with their old `id`, to map `restored_from`
  schedules?: Record<string, any>[];
}

export interface TrashListItem {
  id: number;
  kind: TrashKind;
  identifier: string;
  name: string;
  image: string | null;
  /** The projects it was in that still exist, by name. */
  projectNames: string[];
  schedules: number;
  versions: number;
  deletedAt: string;
  expiresAt: string;
}

const projectsOf = (data: TrashData): string[] => data.projects ?? (data.project ? [data.project] : []);

const TABLES: Record<TrashKind, { table: string; hubLink: string; fk: string; label: string }> = {
  task: { table: 'task', hubLink: 'task_hub_link', fk: 'task_id', label: 'Workflow' },
  app: { table: 'app', hubLink: 'app_hub_link', fk: 'app_id', label: 'App' },
};

const withoutKeys = (row: Record<string, any>, ...keys: string[]) => {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
};

const parse = (value: unknown) => {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const expiresAt = (deletedAt: string) =>
  new Date(new Date(deletedAt).getTime() + TRASH_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();

/**
 * The Trash. Deleting a workflow or app takes a snapshot of it into `trash_item` and
 * then deletes it just like before, so nothing else needs to know about trashed items:
 * a workflow in the Trash can't run, be scheduled or be found. Restoring puts it back
 * with the same identifier, so apps and sub-workflow steps that use it work again.
 */
export class TrashService {
  private static knex(): Knex {
    return Model.knex();
  }

  /** Moves a workflow or app to the Trash. Returns the trash item's id. */
  static async trash(kind: TrashKind, identifier: string): Promise<number> {
    const { table, hubLink, fk, label } = TABLES[kind];
    return await this.knex().transaction(async (trx) => {
      const row = await trx(table).where({ identifier }).first();
      if (!row) throw new Error(`${label} "${identifier}" not found`);

      const link = await trx(hubLink).where({ [fk]: row.id }).first();
      const data: TrashData = {
        row: withoutKeys(row, 'id'),
        projects: await ProjectMembership.projectsOf(kind, row.id, trx),
        hubLink: link ? withoutKeys(link, 'id', fk) : null,
      };

      if (kind === 'task') {
        data.tags = await trx('task_tag')
          .join('tag', 'tag.id', 'task_tag.tag_id')
          .where('task_tag.task_id', row.id)
          .pluck('tag.label');
        data.revisions = (await trx('task_revision').where({ task_id: row.id }).orderBy('id')).map((r) =>
          withoutKeys(r, 'task_id')
        );
        data.schedules = (await trx('schedule').where({ task_id: row.id }).orderBy('id')).map((s) =>
          withoutKeys(s, 'id', 'task_id')
        );
      }

      const [id] = await trx('trash_item').insert({
        kind,
        identifier,
        name: row.name,
        data: JSON.stringify(data),
        deleted_at: new Date().toISOString(),
      });

      // Deleted as before: runs, schedules, tags, hub link and versions go with it.
      await trx(table).where({ id: row.id }).delete();
      if (kind === 'task') {
        // Without foreign_keys on, the cascades don't run; the snapshot has these.
        await trx('task_tag').where({ task_id: row.id }).delete();
        await trx('task_revision').where({ task_id: row.id }).delete();
        await trx('schedule').where({ task_id: row.id }).delete();
      }
      await trx(hubLink).where({ [fk]: row.id }).delete();
      await ProjectMembership.forget(kind, row.id, trx);
      return id;
    });
  }

  static async list(): Promise<TrashListItem[]> {
    const rows = await this.knex()('trash_item').orderBy('deleted_at', 'desc').orderBy('id', 'desc');
    const projects = new Map<string, string>(
      (await this.knex()('project').select('identifier', 'name')).map((p: any) => [p.identifier, p.name])
    );
    return rows.map((item: any) => {
      const data = (parse(item.data) ?? {}) as TrashData;
      const metadata = parse(data.row?.metadata) as any;
      return {
        id: item.id,
        kind: item.kind,
        identifier: item.identifier,
        name: item.name,
        image: metadata?.image ?? null,
        projectNames: projectsOf(data)
          .map((p) => projects.get(p))
          .filter((name): name is string => !!name),
        schedules: data.schedules?.length ?? 0,
        versions: data.revisions?.length ?? 0,
        deletedAt: item.deleted_at,
        expiresAt: expiresAt(item.deleted_at),
      };
    });
  }

  /**
   * Puts a trash item back. Its projects, tags, hub link, versions and schedules come
   * back too; schedules come back turned off, so nothing runs before you've looked.
   * A project or hub deleted in the meantime is left out.
   */
  static async restore(id: number): Promise<{ kind: TrashKind; identifier: string; name: string }> {
    return await this.knex().transaction(async (trx) => {
      const item = await trx('trash_item').where({ id }).first();
      if (!item) throw new Error('This item is no longer in the Trash');
      const kind = item.kind as TrashKind;
      const { table, hubLink, fk, label } = TABLES[kind];
      const data = parse(item.data) as TrashData;

      if (await trx(table).where({ identifier: item.identifier }).first()) {
        throw new Error(`${label} "${item.identifier}" already exists, so this one can't be restored`);
      }

      const { project_id: _old, ...row } = { ...data.row };
      // Items trashed before tags were lowercase still carry their casing in the source.
      if (kind === 'task' && typeof row.source === 'string') {
        const source = JSON.parse(row.source);
        if (Array.isArray(source.tags)) row.source = JSON.stringify({ ...source, tags: TagService.normalizeLabels(source.tags) });
      }
      const [rowId] = await trx(table).insert(row);
      // Back in the projects it was in; ones deleted in the meantime are left out.
      const projectIds: number[] = projectsOf(data).length
        ? await trx('project').whereIn('identifier', projectsOf(data)).pluck('id')
        : [];
      for (const projectId of projectIds) await ProjectMembership.add(kind, projectId, [rowId], trx);

      if (data.hubLink && (await trx('hub').where({ id: data.hubLink.hub_id }).first())) {
        await trx(hubLink).insert({ ...data.hubLink, [fk]: rowId });
      }

      if (kind === 'task') {
        const tagIds: number[] = [];
        for (const tag of TagService.normalizeLabels(data.tags ?? [])) {
          const existing = await trx('tag').where({ label: tag }).first();
          tagIds.push(existing ? existing.id : (await trx('tag').insert({ label: tag }))[0]);
        }
        if (tagIds.length) await trx('task_tag').insert(tagIds.map((tag_id) => ({ task_id: rowId, tag_id })));

        const newIds = new Map<number, number>();
        for (const revision of data.revisions ?? []) {
          const { id: oldId, ...rest } = revision;
          const [newId] = await trx('task_revision').insert({
            ...rest,
            task_id: rowId,
            restored_from: rest.restored_from != null ? (newIds.get(rest.restored_from) ?? null) : null,
          });
          newIds.set(oldId, newId);
        }

        for (const schedule of data.schedules ?? []) {
          // A schedule identifier taken in the meantime gets left out rather than failing the restore.
          if (await trx('schedule').where({ identifier: schedule.identifier }).first()) continue;
          await trx('schedule').insert({ ...schedule, task_id: rowId, enabled: false });
        }
      }

      await trx('trash_item').where({ id }).delete();
      return { kind, identifier: item.identifier, name: item.name };
    });
  }

  /** Deletes trash items for good. Returns what was removed. */
  static async remove(ids: number[]): Promise<{ kind: TrashKind; identifier: string }[]> {
    if (!ids.length) return [];
    const rows = await this.knex()('trash_item').whereIn('id', ids).select('kind', 'identifier');
    await this.knex()('trash_item').whereIn('id', ids).delete();
    return rows;
  }

  static async empty(): Promise<{ kind: TrashKind; identifier: string }[]> {
    return this.remove(await this.knex()('trash_item').pluck('id'));
  }

  /** Deletes items that have been in the Trash longer than TRASH_KEEP_DAYS. */
  static async purgeExpired(): Promise<{ kind: TrashKind; identifier: string }[]> {
    const cutoff = new Date(Date.now() - TRASH_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    return this.remove(await this.knex()('trash_item').where('deleted_at', '<', cutoff).pluck('id'));
  }
}

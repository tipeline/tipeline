import { Model } from 'objection';
import type { Knex } from 'knex';

/** A project a workflow or app is in, as lists and details show it. */
export type ProjectTag = { identifier: string; name: string; color: string | null };

export type MemberKind = 'task' | 'app';

const TABLES = {
  task: { table: 'project_task', fk: 'task_id' },
  app: { table: 'project_app', fk: 'app_id' },
} as const;

/**
 * A select column with every project the row is in, as JSON, by name. `alias` is the
 * table's name (or alias) in the surrounding query. Read it back with `parseProjects`.
 */
export function projectsSubquery(kind: MemberKind, alias: string = kind, as = 'projects'): string {
  const { table, fk } = TABLES[kind];
  return `(
    SELECT COALESCE(json_group_array(json_object('identifier', p.identifier, 'name', p.name, 'color', p.color)), '[]')
    FROM (
      SELECT project.identifier, project.name, project.color
      FROM ${table} m JOIN project ON project.id = m.project_id
      WHERE m.${fk} = ${alias}.id
      ORDER BY project.name COLLATE NOCASE
    ) p
  ) as ${as}`;
}

export function parseProjects(raw: unknown): ProjectTag[] {
  if (Array.isArray(raw)) return raw as ProjectTag[];
  if (typeof raw !== 'string') return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.map((p) => ({ identifier: p.identifier, name: p.name, color: p.color ?? null })) : [];
  } catch {
    return [];
  }
}

/**
 * Which projects a workflow or app is in. A project is a label for organising: being in
 * one, or in several, changes nothing about who may see or run it.
 */
export class ProjectMembership {
  private static knex(trx?: Knex): Knex {
    return trx ?? Model.knex();
  }

  /** Adds the rows to the project; ones already in it stay as they are. Returns the ids added. */
  static async add(kind: MemberKind, projectId: number, ids: number[], trx?: Knex): Promise<number[]> {
    const { table, fk } = TABLES[kind];
    const knex = this.knex(trx);
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const already = new Set<number>(await knex(table).where({ project_id: projectId }).whereIn(fk, unique).pluck(fk));
    const fresh = unique.filter((id) => !already.has(id));
    if (fresh.length) await knex(table).insert(fresh.map((id) => ({ project_id: projectId, [fk]: id })));
    return fresh;
  }

  /** Takes the row out of the project. Returns whether it was in it. */
  static async remove(kind: MemberKind, projectId: number, id: number, trx?: Knex): Promise<boolean> {
    const { table, fk } = TABLES[kind];
    return (await this.knex(trx)(table).where({ project_id: projectId, [fk]: id }).delete()) > 0;
  }

  /** Every project the row is in, by identifier. */
  static async projectsOf(kind: MemberKind, id: number, trx?: Knex): Promise<string[]> {
    const { table, fk } = TABLES[kind];
    return await this.knex(trx)(table)
      .join('project', 'project.id', `${table}.project_id`)
      .where(`${table}.${fk}`, id)
      .orderBy('project.name')
      .pluck('project.identifier');
  }

  /** The ids of a project's workflows or apps. */
  static async memberIds(kind: MemberKind, projectId: number, trx?: Knex): Promise<number[]> {
    const { table, fk } = TABLES[kind];
    return await this.knex(trx)(table).where({ project_id: projectId }).pluck(fk);
  }

  /** Of these rows, the ones in no project at all. */
  static async inNoProject(kind: MemberKind, ids: number[], trx?: Knex): Promise<Set<number>> {
    const { table, fk } = TABLES[kind];
    if (!ids.length) return new Set();
    const placed = new Set<number>(await this.knex(trx)(table).whereIn(fk, ids).distinct(fk).pluck(fk));
    return new Set(ids.filter((id) => !placed.has(id)));
  }

  /** A deleted workflow or app leaves every project (foreign keys aren't on, so no cascade). */
  static async forget(kind: MemberKind, id: number, trx?: Knex): Promise<void> {
    const { table, fk } = TABLES[kind];
    await this.knex(trx)(table).where({ [fk]: id }).delete();
  }

  /** A deleted project lets go of everything in it. */
  static async forgetProject(projectId: number, trx?: Knex): Promise<void> {
    const knex = this.knex(trx);
    await knex('project_task').where({ project_id: projectId }).delete();
    await knex('project_app').where({ project_id: projectId }).delete();
  }
}
